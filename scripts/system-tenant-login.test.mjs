import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {loadSourceBindings} from './helpers/source-bindings.mjs';
const require=createRequire(import.meta.url);
const {companyChoices,resolveCompanyWorkspace}=require('../backend/dist/services/companyWorkspaces.js');
const {createHttpError}=require('../backend/dist/utils/http.js');

test('SYSTEM admin with no employees gets only SYSTEM and cannot forge a BARO login',async()=>{
 const db={systemUser:{findUnique:async()=>({systemRole:'SYSTEM_ADMIN'})},employee:{findMany:async()=>[],findUnique:async()=>null},organization:{findMany:async()=>{throw Error('must not enumerate tenants for login');},findUnique:async()=>{throw Error('must not use tenant fallback');}}};
 const choices=await companyChoices(db,'system@example.com');
 assert.deepEqual(choices.workspaces.map(row=>row.key),['system']);
 await assert.rejects(resolveCompanyWorkspace(db,'system@example.com',1),error=>error.status===403);
});

test('SYSTEM admins who are actual company employees keep their real role and status',async()=>{
 const organization={id:1,name:'BARO',isActive:true,ownerOrgId:null,type:'MANUFACTURER'};
 let status='ACTIVE';const employee=()=>({orgId:1,orgRole:'ACCOUNTANT',name:'Actual employee',status,organization});
 const db={systemUser:{findUnique:async()=>({systemRole:'SYSTEM_ADMIN'})},employee:{findMany:async()=>status==='ACTIVE'?[employee()]:[],findUnique:async()=>employee()}};
 assert.equal((await companyChoices(db,'system@example.com')).workspaces.find(row=>row.id===1).role,'ACCOUNTANT');
 assert.equal((await resolveCompanyWorkspace(db,'system@example.com',1)).orgRole,'ACCOUNTANT');
 status='SUSPENDED';assert.deepEqual((await companyChoices(db,'system@example.com')).workspaces.map(row=>row.key),['system']);
 await assert.rejects(resolveCompanyWorkspace(db,'system@example.com',1),error=>error.status===403);
});

test('SYSTEM context never silently chooses the first company for organization requests',async()=>{
 const prisma={systemUser:{findUnique:async()=>({systemRole:'SYSTEM_ADMIN'})},employee:{findFirst:async()=>null}};
 const {resolveOrganizationByQuery}=loadSourceBindings('backend/src/middleware/access.ts',['resolveOrganizationByQuery'],{prisma,createHttpError,EMPLOYEE_ACCESS_SELECT:{}});
 await assert.rejects(resolveOrganizationByQuery('','system@example.com'),/explicit orgId/);
});

test('SYSTEM auth context is tenantless and rejects a forged company selection',async()=>{
 const ts=require('../backend/node_modules/typescript');
 const source=readFileSync('backend/src/index.ts','utf8');
 const tree=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);let callback;
 const visit=node=>{if(ts.isCallExpression(node)&&node.expression.getText(tree)==='app.get'&&node.arguments[0]?.text==='/auth/context')callback=node.arguments[1].getText(tree);ts.forEachChild(node,visit);};visit(tree);assert.ok(callback);
 let requested='';
 const deps={getRequesterEmail:()=> 'system@example.com',loadRoleAccessPolicySetting:async()=>({policy:{}}),prisma:{systemUser:{findUnique:async()=>({systemRole:'SYSTEM_ADMIN'})},employee:{findUnique:async()=>null}},getRequestedOrgIdText:()=>requested,getSystemAdminContactEmail:()=> 'contact@example.com',resolveCompanyWorkspace};
 const js=ts.transpileModule(`const handler=${callback};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const handler=new Function(...Object.keys(deps),js+';return handler;')(...Object.values(deps));
 let result;await handler({}, {json:value=>result=value});
 assert.equal(result.entryType,'SYSTEM');assert.equal(result.orgId,null);assert.equal(result.orgName,null);assert.equal(result.subscription,null);
 requested='1';await assert.rejects(handler({},{}),error=>error.status===403);
});
