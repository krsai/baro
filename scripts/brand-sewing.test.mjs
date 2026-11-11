import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {changeApprovalFixture} from './helpers/change-approval-fixture.mjs';
import {getAllowedFeaturesForRole,getDefaultRoleAccessPolicy} from '../frontend/src/utils/roleAccessPolicyCore.mjs';
import {canAccessPath} from '../frontend/src/utils/accessControl.js';
import {findLoginWorkspace} from '../frontend/src/utils/loginCompanySelection.mjs';
const require=createRequire(import.meta.url);
const {brandSewingApiFeature,brandSewingMiddleware,readBrandSewingOrders,registerBrandSewingRoutes}=require('../backend/dist/services/brandSewing');
const {previewBrandTestAccess,applyBrandTestAccess,BRAND_TEST_EMAIL}=require('../backend/dist/services/brandTestAccess');
const {createStyleProduct,updateStyleProduct}=require('../backend/dist/services/styleProducts');
const {companyChoices}=require('../backend/dist/services/companyWorkspaces');

test('a brand-only admin cannot turn the limited portal into company provisioning',async()=>{
 const db={systemUser:{findUnique:async()=>null},employee:{findMany:async()=>[{orgId:2,orgRole:'ADMIN',organization:{id:2,name:'THE SAN',type:'BRAND'}}]}};
 assert.equal((await companyChoices(db,'brand@example.test')).canCreateCompany,false);
});

test('brand menus and login matching never turn SYSTEM, labels or another company into a brand membership',()=>{
 const policy=getDefaultRoleAccessPolicy(),auth={isAuthenticated:true,accessProfile:{entryType:'ORG',orgType:'BRAND',orgRole:'ADMIN',accessPolicy:policy,industryMenuFeatures:['STYLE','ORDER']}};
 assert.deepEqual(new Set(getAllowedFeaturesForRole({orgType:'BRAND',orgRole:'ADMIN',policy})),new Set(['STYLE','ORDER']));
 for(const path of ['/style','/order','/customer-production-report'])assert.equal(canAccessPath(path,auth),true);
 for(const path of ['/dashboard','/assignment','/work-history','/bank-ledger','/payroll','/employee','/shipping'])assert.equal(canAccessPath(path,auth),false,path);
 const system={key:'system',type:'SYSTEM',role:'SYSTEM_ADMIN'};assert.equal(findLoginWorkspace([system],'TEST_THESAN'),null);
 assert.equal(findLoginWorkspace([{key:'org:1',code:'THES',type:'MANUFACTURER'}],'TEST_THESAN'),null);
 assert.equal(findLoginWorkspace([{key:'org:2',code:'THES',type:'BRAND'}],'TEST_THESAN').key,'org:2');
 assert.equal(brandSewingApiFeature('/brand-sewing/styles/7'),'STYLE');assert.equal(brandSewingApiFeature('/brand-sewing/progress'),'ORDER');assert.equal(brandSewingApiFeature('/styles/7/bom'),null);
});

const context=()=>({organization:{id:2,type:'BRAND',ownerOrgId:null,isActive:true,subscription:{status:'ACTIVE'}},employee:{id:9,orgId:2,status:'ACTIVE',orgRole:'ADMIN'}});
const response=()=>({statusCode:200,status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}});
const policyDb=()=>({systemSetting:{findUnique:async()=>null},partnerClassification:{findUnique:async()=>null},systemUser:{findUnique:async()=>null}});
test('brand APIs enforce active real membership, saved role/industry restrictions, subscription and private API denial',async()=>{
 const db=policyDb();let ctx=context(),allowed=['STYLE','ORDER'];
 const gates={getEmail:()=>BRAND_TEST_EMAIL,getOrganization:async()=>ctx.organization,requireOrgRole:async(_req,_res,options)=>{assert.equal(options.allowSystemAdmin,false);return ctx;},loadPolicy:async()=>({policy:{BRAND:{ADMIN:allowed}}})};
 const middleware=brandSewingMiddleware(db,gates);
 for(const path of ['/bank-ledger','/styles/7','/work-logs','/employees','/assignment-plan-progress','/invoices']){const res=response();await middleware({method:'GET',path,query:{orgId:2}},res,()=>assert.fail('private API reached'));assert.equal(res.statusCode,403);}
 for(const patch of [{employee:null},{employee:{...ctx.employee,orgId:3}},{employee:{...ctx.employee,status:'SUSPENDED'}},{organization:{...ctx.organization,subscription:{status:'SUSPENDED'}}}]){const original=ctx;ctx={...ctx,...patch};const res=response();await middleware({method:'GET',path:'/brand-sewing/orders',query:{orgId:2}},res,()=>assert.fail('invalid scope reached'));assert.equal(res.statusCode,403);ctx=original;}
 allowed=[];let res=response();await middleware({method:'GET',path:'/brand-sewing/orders',query:{orgId:2}},res,()=>assert.fail('saved denial ignored'));assert.equal(res.statusCode,403);allowed=['STYLE','ORDER'];
 db.systemSetting.findUnique=async()=>({value:{revision:1,subscribers:{BRAND:['STYLE']},industries:{}}});res=response();await middleware({method:'GET',path:'/brand-sewing/orders',query:{orgId:2}},res,()=>assert.fail('industry denial ignored'));assert.equal(res.statusCode,403);
});

test('order projection separates equal external IDs across manufacturers and strips all private data and wrong style owners',async()=>{
 const ownStyle={id:11,code:'OWN',name:'Own product',customerOrgId:2,productStyle:{id:41,ownerOrgId:2}};
 const orders=[{id:1,orderId:'A',orderNumber:'A',sellerOrgId:1,totalQuantity:100,sellerOrg:{id:1,name:'Maker A'},workOrderItems:[{styleId:11,totalQuantity:100,style:ownStyle}],priorCompletions:[],margin:'PRIVATE'},{id:2,orderId:'B',orderNumber:'B',sellerOrgId:4,totalQuantity:100,sellerOrg:{id:4,name:'Maker B'},workOrderItems:[{styleId:11,totalQuantity:100,style:ownStyle}],priorCompletions:[]}];
 const db={workOrder:{findMany:async args=>{assert.deepEqual(args.where,{buyerOrgId:2});assert.equal(args.select.createdBy,undefined);return orders;}},assignmentPlan:{findMany:async()=>[{orgId:1,externalId:'same',workOrderId:1,styleId:11},{orgId:4,externalId:'same',workOrderId:2,styleId:11}]}};
 const rows=await readBrandSewingOrders(db,2,async(org,ids)=>{assert.deepEqual(ids,['same']);return [{id:'same',plannedQuantity:100,producedQuantity:org===1?20:70,operationalProgressRatio:org===1?.2:.7,dailyProducedQuantities:[{date:'2026-11-01',quantity:org===1?20:70}],processes:[{ct:'PRIVATE'}],factoryName:'PRIVATE'}];});
 assert.equal(rows[0].producedQuantity,20);assert.equal(rows[1].producedQuantity,70);assert.equal(JSON.stringify(rows).includes('PRIVATE'),false);assert.equal(rows[0].items[0].linkVerified,true);
 orders[0].workOrderItems[0].style={...ownStyle,customerOrgId:3,code:'FOREIGN SECRET',productStyle:{id:42,ownerOrgId:3}};
 const guarded=await readBrandSewingOrders(db,2,async()=>[]);assert.equal(guarded[0].items[0].code,'');assert.equal(guarded[0].items[0].styleId,null);assert.equal(guarded[0].producedQuantity,null);
});

test('style response whitelists product fields and rejects another brand or owner injection before writing',async()=>{
 const routes=new Map(),db={...policyDb(),styleProduct:{findMany:async args=>{assert.deepEqual(args.where,{ownerOrgId:2});return [{id:1,revision:2,fields:{code:'A',name:'Own',processes:'PRIVATE',cost:'PRIVATE'}}];},findFirst:async()=>null}};
 registerBrandSewingRoutes({get:(p,fn)=>routes.set('GET '+p,fn),post:(p,fn)=>routes.set('POST '+p,fn),put:(p,fn)=>routes.set('PUT '+p,fn)},db,{requireOrgRole:async()=>context(),loadPolicy:async()=>({policy:{BRAND:{ADMIN:['STYLE','ORDER']}}})});
 const res=response();await routes.get('GET /brand-sewing/styles')({},res);assert.equal(JSON.stringify(res.body).includes('PRIVATE'),false);
 await assert.rejects(routes.get('PUT /brand-sewing/styles/:id')({params:{id:'7'},body:{fields:{code:'x',name:'x'},revision:1}},response()),/STYLE_PRODUCT_NOT_FOUND/);
 await assert.rejects(routes.get('POST /brand-sewing/styles')({body:{fields:{code:'x',name:'x'},ownerOrgId:1}},response()),/STYLE_PRODUCT_FIELDS_INVALID/);
});

test('actual Prisma/Postgres test registration is reviewed and idempotent, preserves owners, and style edits retain production snapshots',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db;await db.organization.createMany({data:[{id:1,code:'BARO',name:'BARO',type:'MANUFACTURER',dataOwnerOrgId:1},{id:2,code:'THES',name:'THE SAN',type:'BRAND',dataOwnerOrgId:1},{id:3,code:'URDK',name:'URIDEUL',type:'BRAND',dataOwnerOrgId:1}]});
  await db.systemUser.create({data:{email:BRAND_TEST_EMAIL,systemRole:'SYSTEM_ADMIN'}});
  for(const orgId of [2,3])await db.organizationSubscription.create({data:{orgId,status:'ACTIVE',membershipEmail:BRAND_TEST_EMAIL}});
  const before=await db.organization.findMany({orderBy:{id:'asc'}}),plan=await previewBrandTestAccess(db,BRAND_TEST_EMAIL);
  await assert.rejects(db.$transaction(tx=>applyBrandTestAccess(tx,BRAND_TEST_EMAIL,'wrong')),/BRAND_TEST_REVISION_CHANGED/);assert.equal(await db.employee.count(),0);
  const result=await db.$transaction(tx=>applyBrandTestAccess(tx,BRAND_TEST_EMAIL,plan.revision));assert.equal(result.members.length,2);assert.equal(await db.employee.count(),2);
  assert.deepEqual(await db.organization.findMany({orderBy:{id:'asc'}}),before);
  assert.deepEqual((await db.$transaction(tx=>applyBrandTestAccess(tx,BRAND_TEST_EMAIL,plan.revision))).members,result.members);assert.equal(await db.employee.count(),2);
  const member=result.members.find(m=>m.orgId===2),fields={code:'OWN',name:'Brand original',registrationDate:'2026-11-11',designer:'',season:'',imageUrls:[]};
  const product=await createStyleProduct(db,2,member.employeeId,{fields});assert.equal(product.ownerOrgId,2);
  const changed=await updateStyleProduct(db,2,member.employeeId,product.id,{revision:product.revision,fields:{...fields,name:'Changed original'}});assert.equal(changed.ownerOrgId,2);assert.equal(changed.revision,2);assert.equal(await db.style.count(),0,'brand editing does not fabricate manufacturer production styles');
  await assert.rejects(updateStyleProduct(db,3,result.members.find(m=>m.orgId===3).employeeId,product.id,{revision:2,fields:{...fields,name:'Foreign'}}),/STYLE_PRODUCT_NOT_FOUND/);
 }finally{await f.close();}
});
