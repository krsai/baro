import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url),ts=require('../backend/node_modules/typescript');
const {saveNewPartnerBankAccounts}=require('../backend/dist/services/newPartnerBankAccounts');
const {registerEntityBankRoutes}=require('../backend/dist/services/entityBankAccount');
const {saveClassification}=require('../backend/dist/services/partnerClassification');
const {resolvePartnerIdentity}=require('../backend/dist/services/entityProfile');
const {normalizeLocalizedName}=require('../backend/dist/utils/localizedName');
function createRoute(db,s){
 const tree=ts.createSourceFile('index.ts',fs.readFileSync('backend/src/index.ts','utf8'),ts.ScriptTarget.Latest,true);
 const node=tree.statements.find(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(tree)==='app.post'&&node.expression.arguments[0]?.text==='/business-partners');let handler;
 const dependencies={app:{post:(_path,fn)=>handler=fn},prisma:db,ORG_MANAGEMENT_ROLES:['ADMIN','ACCOUNTANT','OPERATOR'],requireOrgRole:async()=>({organization:s.company}),normalizeLocalizedName,resolveOptionalString:(value,fallback)=>value||fallback,getRequesterEmail:()=>s.people.admin.email,resolvePartnerServiceTypeIds:async()=>[],linkedPartnerCompany:async()=>null,resolvePartnerIdentity,partnerProfilePatch:()=>({}),subscriberProfilePatch:()=>({}),saveClassification,getCurrentRequestActorEmployeeId:()=>s.people.admin.id,saveNewPartnerBankAccounts,connectPartnerCompany:async()=>{},BUSINESS_PARTNER_SERVICE_INCLUDE:{},attachPartnerClassifications:async(_db,_org,rows)=>rows,toBusinessPartnerResponse:row=>row};
 new Function(...Object.keys(dependencies),ts.transpileModule(node.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(...Object.values(dependencies));return handler;
}
test('actual partner create route commits accounts and classification together, or rolls all of them back',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),industry=await db.outsourcingServiceType.findUnique({where:{id:s.code.serviceTypeId},include:{systemDefault:true}}),route=createRoute(db,s);
  const account={accountKind:'BANK',currencyId:s.currency.id,bankName:'Bank',accountNumber:'NEW-001',accountHolder:'Payee'};
  const body={name:'New payee',code:'NPAY',type:'PROCESS_OUTSOURCING',partyKind:'INDIVIDUAL',country:'VN',classification:{revision:0,roleIds:[industry.systemDefault.partnerRoleId],industryIds:[industry.systemDefault.id]},bankAccounts:[account,{...account,accountNumber:'NEW-002'}]};
  const before=await db.organizationBankAccount.count(),classifications=await db.partnerClassification.count();
  const res={status(){return this;},json(value){this.value=value;}};
  await assert.rejects(route({body:{...body,bankAccounts:[account,{...account,accountNumber:''}]}},res),/INVALID_BANK_ACCOUNT/);
  assert.equal(await db.organization.count({where:{ownerOrgId:s.company.id,name:body.name}}),0);assert.equal(await db.organizationBankAccount.count(),before);assert.equal(await db.partnerClassification.count(),classifications);
  await route({body},res);const saved=res.value;assert.ok(saved.id);assert.equal(await db.organizationBankAccount.count({where:{orgId:s.company.id,entityId:saved.id}}),2);assert.equal(await db.partnerClassificationIndustry.count({where:{orgId:s.company.id,entityId:saved.id}}),1);
  await assert.rejects(db.$transaction(tx=>saveNewPartnerBankAccounts(tx,s.company.id,s.people.admin.id,saved.id,[{...account,orgId:s.other.id}])),/INVALID_BANK_ACCOUNT/);
  await assert.rejects(db.$transaction(tx=>saveNewPartnerBankAccounts(tx,s.other.id,s.people.admin.id,saved.id,[account])),/BANK_ACCOUNT_ACCESS_DENIED/);
  assert.equal(await db.organizationBankAccount.count(),before+2);
  const routes=new Map();let context=s.company;
  registerEntityBankRoutes({get:(path,fn)=>routes.set(path,fn),put:()=>{},post:()=>{}},db,{requireOrgRole:async()=>({organization:context}),getActor:()=>s.people.admin.id});
  let currencies;await routes.get('/bank-account-currencies')({query:{orgId:s.other.id}},{json:value=>currencies=value});assert.ok(currencies.some(row=>row.id===s.currency.id),'currency lookup uses authenticated context');
  context=s.other;await assert.rejects(routes.get('/bank-account-currencies')({},{json:()=>{}}),/BANK_ACCOUNT_ACCESS_DENIED/);
 }finally{await f.close();}
});
