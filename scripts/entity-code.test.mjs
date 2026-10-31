import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {ENTITY_CODE_TEXT,entityCodeError} from '../frontend/src/utils/entityCode.mjs';
const require=createRequire(import.meta.url),ts=require('../backend/node_modules/typescript');
const {resolvePartnerCode}=require('../backend/dist/services/entityProfile.js');
const transpile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const response=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}});
function organizationRoutes(db){
 const routes=new Map(),router={use(){},patch(){},get(path,fn){routes.set('get '+path,fn);},post(path,fn){routes.set('post '+path,fn);},put(path,fn){routes.set('put '+path,fn);}};
 const exports={};new Function('require','exports',transpile(readFileSync('backend/src/organizations/organization.routes.ts','utf8')))(name=>{
  if(name==='../utils/localizedName')return {normalizeEntityNameInput(){}};
  if(name==='@prisma/client')return {};
  if(name==='express')return {Router:()=>router};
  if(name==='../db')return {prisma:db};
  if(name==='../services/entityProfile')return {resolvePartnerCode};
  if(name==='../middleware/access')return {getRequesterEmail:()=> 'admin@example.com',requireSystemAdmin:async()=>true,attachOrganizationSubscription:async o=>o};
  throw Error(name);
 },exports);
 exports.createOrganizationRouter({applySubscriptionPayload:async()=>{},toOrganizationResponse:o=>o});return routes;
}
function organizationFixture(){
 const state={entity:{id:1,name:'BARO GARMENT',code:'BRVN'},allowed:true,conflict:false,writes:0};
 const db={systemUser:{findUnique:async()=>null},employee:{findUnique:async({where})=>state.allowed&&where.orgId_email.orgId===1?{status:'ACTIVE',orgRole:'ADMIN'}:null},organization:{
  findUnique:async()=>state.entity,findFirst:async({where})=>{assert.equal(where.code.mode,'insensitive');assert.equal(where.NOT?.id,1);return state.conflict?{id:2}:null;},
  update:async({where,data})=>{state.writes++;assert.equal(where.id,1);Object.assign(state.entity,data);return state.entity;},
 }};
 return {state,put:organizationRoutes(db).get('put /organizations/:id')};
}
test('explicit codes normalize; empty codes use at most six English name characters without silent suffixes',()=>{
 for(const empty of ['',null,undefined,'  '])assert.equal(resolvePartnerCode(empty,'THE SAN Co., Ltd.'),'THESAN');
 assert.equal(resolvePartnerCode('', 'A & B'),'AB');assert.equal(resolvePartnerCode(' vendor-12.a_ ','ignored'),'VENDOR-12.A_');
 assert.throws(()=>resolvePartnerCode('','한국'),/PARTNER_CODE_REQUIRED/);assert.throws(()=>resolvePartnerCode('invalid code','Name'),/INVALID_PARTNER_CODE/);
});
test('active own-company admin can edit the global code and blank input generates a code while keeping the entity ID',async()=>{
 const {state,put}=organizationFixture();let res=response();await put({params:{id:'1'},body:{name:'BARO GARMENT',code:'new-01'}},res);
 assert.equal(res.body.code,'NEW-01');assert.equal(res.body.id,1);
 res=response();await put({params:{id:'1'},body:{code:''}},res);assert.equal(res.body.code,'BAROGA');assert.equal(state.writes,2);
});
test('duplicate explicit and generated codes cannot change company data, and another company cannot edit it',async()=>{
 const {state,put}=organizationFixture();state.conflict=true;
 for(const code of ['TAKEN','']){const res=response();await put({params:{id:'1'},body:{name:'BARO GARMENT',code}},res);assert.equal(res.statusCode,409);assert.equal(res.body.error,'PARTNER_CODE_CONFLICT');}
 assert.equal(state.writes,0);assert.equal(state.entity.code,'BRVN');
 const res=response();await put({params:{id:'2'},body:{code:'NEW'}},res);assert.equal(res.statusCode,403);assert.equal(state.writes,0);
});
test('code editing does not grant type or subscription editing permission',async()=>{
 const {state,put}=organizationFixture();for(const body of [{code:'NEW',type:'SERVICE'},{code:'NEW',subscriptionStatus:'ACTIVE'}]){const res=response();await put({params:{id:'1'},body},res);assert.equal(res.statusCode,403);}assert.equal(state.writes,0);
});
test('duplicate and generation errors tell users how to choose a unique code in all three languages',()=>{
 for(const lang of ['ko','en','vi']){assert.equal(entityCodeError({message:'code already exists'},lang),ENTITY_CODE_TEXT[lang].conflict);assert.equal(entityCodeError({message:'PARTNER_CODE_CONFLICT'},lang),ENTITY_CODE_TEXT[lang].conflict);assert.equal(entityCodeError({message:'PARTNER_CODE_REQUIRED'},lang),ENTITY_CODE_TEXT[lang].required);}
});
test('a DB uniqueness race returns the partner code warning rather than a 500 or a color-code error',()=>{
 const source=readFileSync('backend/src/index.ts','utf8'),tree=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
 const node=tree.statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(tree)==='app.use'&&n.expression.arguments[0]?.parameters?.length===4);
 assert.ok(node);let handler;
 new Function('app','toErrorRecord','getErrorCode',transpile(node.getText(tree)))({use:fn=>handler=fn},e=>e,e=>e.code);
 for(const originalUrl of ['/customers/7?orgId=1','/organizations/1','/business-partners/44','/auth/workspaces']){
  const res=response();handler({code:'P2002',meta:{target:['code']}},{originalUrl},res,()=>{});assert.equal(res.statusCode,409);assert.equal(res.body.error,'PARTNER_CODE_CONFLICT');
 }
});
