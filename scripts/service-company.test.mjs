import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {canAccessPath} from '../frontend/src/utils/accessControl.js';
import {getDefaultRoleAccessPolicy,sanitizeRoleAccessPolicy,ROLE_ACCESS_POLICY_SCHEMA_VERSION} from '../frontend/src/utils/roleAccessPolicyCore.mjs';
import {SERVICE_FEATURES,SERVICE_ROLE_DEFAULTS,workplaceText} from '../frontend/src/utils/serviceCompany.mjs';
import {loadSourceBindings} from './helpers/source-bindings.mjs';
const require=createRequire(import.meta.url);
const server=require('../backend/dist/services/serviceCompany.js');
const {effectiveExpenseCode,resolveExpenseCodeLink}=require('../backend/dist/services/expenseCodeLinkPolicy.js');
const {copyAdministrationTemplate}=require('../backend/dist/services/companyAdministrationTemplate.js');
const {previewCompanyLoginSplit,applyCompanyLoginSplit}=require('../backend/dist/services/companyLoginSplit.js');
const {createServiceCompany}=require('../backend/dist/services/companyWorkspaces.js');

test('service company common functions and hard production boundary agree on client/server',()=>{
 assert.deepEqual(SERVICE_ROLE_DEFAULTS,server.SERVICE_ROLE_DEFAULTS);assert.deepEqual(SERVICE_FEATURES,server.SERVICE_FEATURES);
 const state={isAuthenticated:true,accessProfile:{entryType:'ORG',orgType:'SERVICE',orgRole:'ADMIN',accessPolicy:getDefaultRoleAccessPolicy()}};
 for(const path of ['/employee','/attendance','/holiday','/payroll','/business-partner','/bank-ledger','/account-overview','/outsourcing-record','/approval-settings','/employee-system','/salary-system','/business','/personal-settings'])assert.equal(canAccessPath(path,state),true,path);
 state.accessProfile.accessPolicy.SERVICE.ADMIN.push('ORDER','STYLE','INVENTORY','ASSIGNMENT','INVOICE');
 for(const path of ['/order','/style','/inventory/stock','/assignment','/invoices','/work-history','/production-analysis'])assert.equal(canAccessPath(path,state),false,path);
 assert.equal(server.supportsWorkplaces({type:'SERVICE'}),true);assert.equal(server.supportsWorkplaces({type:'BRAND'}),false);
});
test('only the complete historical banking starter policy upgrades; saved custom denials survive',()=>{
 const old={ADMIN:['BANK_LEDGER'],ACCOUNTANT:['BANK_LEDGER'],OPERATOR:[],WORKER:[]};
 assert.deepEqual(sanitizeRoleAccessPolicy({__schemaVersion:13,SERVICE:old}).SERVICE,SERVICE_ROLE_DEFAULTS);
 const custom={...old,ACCOUNTANT:[]};assert.deepEqual(sanitizeRoleAccessPolicy({__schemaVersion:13,SERVICE:custom}).SERVICE,{...custom,ADMIN:['BANK_LEDGER','ACCOUNT_OVERVIEW']});
 assert.deepEqual(sanitizeRoleAccessPolicy({__schemaVersion:ROLE_ACCESS_POLICY_SCHEMA_VERSION,SERVICE:old}).SERVICE,old);
 assert.equal(workplaceText('공장 선택','SERVICE'),'사업장 선택');assert.equal(workplaceText('Select Factory','SERVICE'),'Select Workplace');assert.equal(workplaceText('Chọn nhà máy','SERVICE'),'Chọn nơi làm việc');assert.equal(workplaceText('Factory','MANUFACTURER'),'Factory');
});
test('Vietnam service companies use Vietnam month boundaries without changing manufacturer time zones',()=>{
 const {resolveCurrentPayrollMonthKey}=require('../backend/dist/utils/payrollMonth.js');
 const now=new Date('2026-11-30T16:30:00Z'),timeZone=server.companyBusinessTimeZone({type:'SERVICE',country:'VN'});
 assert.equal(timeZone,'Asia/Ho_Chi_Minh');assert.equal(resolveCurrentPayrollMonthKey({now,timeZone}),'2026-11');
 assert.equal(resolveCurrentPayrollMonthKey({now,timeZone:'Asia/Seoul'}),'2026-12');
 assert.equal(server.companyBusinessTimeZone({type:'MANUFACTURER',country:'VN'}),process.env.BUSINESS_TIME_ZONE||'Asia/Seoul');
});
test('service expense codes retain transport requirements without manufacturing references; saved snapshots survive',async()=>{
 const code={baseId:10,base:{entryMode:'PROCESS',orderInput:'REQUIRED',styleInput:'REQUIRED',processInput:'REQUIRED',requiredFields:['transportDate','origin']}};
 const resolved=effectiveExpenseCode(code,null,'SERVICE');
 assert.equal(resolved.linkTarget,'NONE');assert.equal(resolved.base.entryMode,'GENERAL');
 for(const key of ['orderInput','styleInput','processInput'])assert.equal(resolved.base[key],'HIDDEN');
 assert.deepEqual(resolved.base.requiredFields,['transportDate','origin','reference']);assert.equal(effectiveExpenseCode(code).base.entryMode,'PROCESS');
 const retained=await resolveExpenseCodeLink({},2,code,{cost:{linkTarget:'PROCESS',styleProcessId:5}},'SERVICE');assert.equal(retained.linkTarget,'PROCESS');
});
test('grade template uses new company FKs and copies definitions without people or salary amounts',async()=>{
 const writes=[],sourceGrade={id:10,code:'STAFF',name:'Staff',nameKo:'직원',nameEn:'Staff',nameVi:'Nhân viên',sortOrder:0,isActive:true,isDefault:true};
 const db={organization:{findUnique:async()=>({id:1,type:'MANUFACTURER',ownerOrgId:null})},employeeGradeSet:{findMany:async()=>[{id:5,code:'STAFF',name:'Staff',isActive:true,grades:[sourceGrade]}],count:async()=>0,create:async({data})=>{writes.push(['set',data]);return {id:100};}},employeeGrade:{create:async({data})=>{writes.push(['grade',data]);return {id:101};}},employeePayTypePolicy:{findMany:async()=>[{payType:'GENERAL',workWeekdays:[1,2,3,4,5],standardClockIn:'08:00',standardClockOut:'17:00',breakMinutes:60,workdayMinimumMinutes:240}],create:async({data})=>writes.push(['schedule',data])},systemSetting:{findUnique:async({where})=>({value:where.key.startsWith('APP_')?{defaultVatRate:'10',otherCompanyPrivateData:'do-not-copy'}:{limits:{VND:{senior:'20',lead:'100'}},employeeIds:[99]}}),create:async({data})=>writes.push(['setting',data])}};
 assert.equal(await copyAdministrationTemplate(db,1,2),101);
 assert.equal(writes.find(([kind])=>kind==='grade')[1].setId,100);
 assert.equal(writes.find(([kind])=>kind==='grade')[1].orgId,2);
 assert.ok(writes.filter(([kind])=>kind==='setting').every(([,data])=>!JSON.stringify(data.value).includes('employeeIds')&&!JSON.stringify(data.value).includes('PrivateData')));
 assert.equal(sourceGrade.id,10);await assert.rejects(copyAdministrationTemplate(db,1,1),/INVALID_COMPANY_TEMPLATE/);
});
function identityFixture(){
 const rows=[{id:7,orgId:1,email:'baro.garment@gmail.com',name:'정동원',orgRole:'ADMIN',status:'ACTIVE',gradeId:10,factoryId:3,employeeNo:'BARO0001',payrollExcluded:false,phone:'preserve',updatedAt:new Date('2026-10-01')}],settings=new Map(),writes=[];
 const db={organization:{findUnique:async()=>({id:1,code:'BARO',name:'BARO GARMENT',type:'MANUFACTURER',ownerOrgId:null})},employee:{findFirst:async({where})=>rows.find(row=>row.id===where.id&&row.orgId===where.orgId)||null,findUnique:async({where})=>rows.find(row=>row.orgId===where.orgId_email.orgId&&row.email===where.orgId_email.email)||null,findMany:async()=>rows,update:async({where,data})=>{writes.push(['update',where.id,data]);Object.assign(rows.find(row=>row.id===where.id),data);},create:async({data})=>{const row={id:8,...data};rows.push(row);writes.push(['create',row]);return row;}},systemSetting:{findUnique:async({where})=>settings.get(where.key)||null,create:async({data})=>settings.set(data.key,data)},$executeRaw:async()=>{}};
 return {db,rows,writes};
}
test('private login stays on the original employee FK; only a separate BARO shared admin is payroll-exempt',async()=>{
 const {db,rows,writes}=identityFixture(),input={orgId:1,personId:7,personalEmail:'krsailer82@gmail.com',sharedEmail:'baro.garment@gmail.com'};
 const plan=await previewCompanyLoginSplit(db,input);assert.equal(writes.length,0);
 const request={...input,revision:plan.revision};const result=await applyCompanyLoginSplit(db,request,'krsailer82@gmail.com');
 assert.deepEqual(result,{personId:7,sharedId:8});assert.equal(rows[0].email,input.personalEmail);assert.equal(rows[0].phone,'preserve');assert.equal(rows[0].employeeNo,'BARO0001');assert.equal(rows[0].payrollExcluded,false);
 assert.equal(rows[1].email,input.sharedEmail);assert.equal(rows[1].payrollExcluded,true);assert.equal(rows[1].employeeNo,'BARO0002');assert.equal(rows[1].orgId,1);
 assert.deepEqual(await applyCompanyLoginSplit(db,request,'krsailer82@gmail.com'),result);assert.equal(rows.length,2);
});
test('identity split rejects stale review and a different existing personal employee without merging IDs',async()=>{
 const {db,rows,writes}=identityFixture(),input={orgId:1,personId:7,personalEmail:'krsailer82@gmail.com',sharedEmail:'baro.garment@gmail.com'};
 await assert.rejects(applyCompanyLoginSplit(db,{...input,revision:'stale'},input.personalEmail),/SPLIT_CHANGED/);assert.equal(writes.length,0);
 rows.push({...rows[0],id:9,email:input.personalEmail});await assert.rejects(previewCompanyLoginSplit(db,input),/ALREADY_LINKED_REVIEW_REQUIRED/);assert.equal(writes.length,0);
});
test('DEX registration creates a separate payroll member with attendance exemption exactly once',async()=>{
 const companies=[],employees=[],workplaces=[],receipts=[];
 const db={systemUser:{findUnique:async()=>({systemRole:'SYSTEM_ADMIN'})},organization:{findFirst:async({where})=>companies.find(row=>row.code===where.code.equals)||null,findUnique:async({where})=>companies.find(row=>row.id===where.id)||null,create:async({data})=>{const row={id:2,...data};companies.push(row);return row;}},employee:{findMany:async()=>[],create:async({data})=>employees.push(data)},employeeGrade:{findFirst:async()=>({id:10})},currency:{findUnique:async({where})=>where.code==='VND'?{id:1,code:'VND'}:null},factory:{create:async({data})=>{const row={id:20,...data};workplaces.push(row);return row;}},organizationSubscription:{create:async()=>{}},companyWorkspaceRegistration:{findUnique:async()=>receipts[0]?{...receipts[0],organization:companies[0]}:null,create:async({data})=>receipts.push(data)},$executeRaw:async()=>{},$transaction:async fn=>fn(db)};
 const body={name:'DEX LOGIS',nameKo:'덱스로지스',nameVi:'',code:'',adminName:'정동원',country:'VN',currencyCode:'VND',managementStartDate:'2026-11-01',adminPayrollExcluded:false,adminAlwaysFullAttendance:true,clientKey:randomUUID(),ownerEmail:'baro.garment@gmail.com'};
 await createServiceCompany(db,'krsailer82@gmail.com',body);assert.equal(companies[0].code,'DEXLOG');assert.equal(companies[0].type,'SERVICE');assert.equal(companies[0].country,'VN');
 assert.equal(workplaces[0].managementStartDate,'2026-11-01');assert.equal(workplaces[0].salaryCurrencyId,1);
 assert.equal(employees[0].name,'정동원');assert.equal(employees[0].email,'krsailer82@gmail.com');assert.equal(employees[0].orgId,2);assert.equal(employees[0].factoryId,20);assert.equal(employees[0].employeeNo,'DEXLOG0001');assert.equal(employees[0].payrollExcluded,false);assert.equal(employees[0].alwaysFullAttendance,true);assert.equal(employees.length,1);
 await createServiceCompany(db,'krsailer82@gmail.com',body);assert.equal(workplaces.length,1);assert.equal(employees.length,1);
 await assert.rejects(createServiceCompany(db,'krsailer82@gmail.com',{...body,managementStartDate:'2026-11-02'}),/RETRY_CONFLICT/);
});
test('service salary setup and save use general pay without manufacturing allowance or rate writes',async()=>{
 const routes=new Map(),items=[],versions=[],writes=[];
 const db={factory:{findFirst:async()=>({id:20,salaryCurrency:{code:'VND'},organization:{salaryCurrency:{code:'VND'}}}),update:async()=>{}},employeeCompensationPolicy:{findMany:async()=>[]},employeeGrade:{findMany:async()=>[]},currency:{findUnique:async()=>({id:1})},salaryItem:{findFirst:async()=>items[0]||null,findMany:async()=>items,create:async({data})=>{const row={id:items.length+1,...data};items.push(row);writes.push(row);return row;},upsert:async({where,update})=>{const row=items.find(item=>item.code===where.factoryId_code.code);Object.assign(row,update);return row;},updateMany:async()=>{}},salaryItemRate:{findMany:async()=>[],deleteMany:async()=>{}},salarySystemVersion:{findFirst:async()=>versions[0]||null,findMany:async()=>versions,create:async({data})=>versions.push({id:1,confirmedDate:new Date(),...data})},$transaction:async fn=>fn(db)};
 const router={get:(path,fn)=>routes.set('get:'+path,fn),put:(path,fn)=>routes.set('put:'+path,fn),post:(path,fn)=>routes.set('post:'+path,fn)};
 const localized=require('../backend/dist/utils/localizedName.js'),{validateSalaryFormula}=require('../backend/dist/employees/salaryFormula.js');
 const {createSalarySystemRouter}=loadSourceBindings('backend/src/employees/salarySystem.routes.ts',['createSalarySystemRouter','PAY_TYPES','PAYMENT_MONTHS_BY_CYCLE','toJsonSnapshot'],{...localized,Router:()=>router,prisma:db,getOrganizationByQuery:async()=>({id:2,type:'SERVICE'}),getRequesterEmail:()=> 'krsailer82@gmail.com',defaultVersionStartMonth:()=> '2026-11',normalizeCurrencyCode:value=>value,editRevision:()=> 'r1',assertEditRevision:expected=>assert.equal(expected,'r1'),editTransaction:async(_db,fn)=>fn(db),validateSalaryFormula});
 createSalarySystemRouter({requireSalarySystemManager:async()=>true});
 const response=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
 let res=response();await routes.get('get:/salary-system')({query:{factoryId:'20'}},res);assert.equal(res.statusCode,200);assert.equal(items.length,2);assert.ok(items.every(row=>row.category!=='INCENTIVE'&&JSON.stringify(row.payTypes)==='["GENERAL"]'));assert.ok(writes.every(row=>!JSON.stringify(row.formula).includes('PRODUCTION')));
 res=response();await routes.get('put:/salary-system')({query:{factoryId:'20'},body:{expectedRevision:'r1',currencyCode:'VND',items:items.map(row=>({...row})),rates:[]}},res);assert.equal(res.statusCode,200,'No fixed incentive item is required for service companies');
 const before=JSON.stringify(items);res=response();await routes.get('put:/salary-system')({query:{factoryId:'20'},body:{expectedRevision:'r1',currencyCode:'VND',items:[{...items[0],payTypes:['OUTPUT']}],rates:[]}},res);assert.equal(res.statusCode,400);assert.equal(JSON.stringify(items),before);
});
