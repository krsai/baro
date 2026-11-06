import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('../backend/node_modules/typescript');
const source=readFileSync('backend/src/index.ts','utf8'),start=source.indexOf("app.get('/holidays'"),end=source.indexOf('\napp.',source.indexOf("app.put('/holidays'",start)+10),code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
 const routes=new Map();let rows=[{holidayDate:'2026-11-02',isPaid:false}],allowed=true,balanceValid=true,writes=0;
 const model={findMany:async({where})=>{assert.equal(where.orgId,7);return structuredClone(rows);},deleteMany:async({where})=>{assert.equal(where.orgId,7);writes++;rows=rows.filter(row=>where.holidayDate.notIn.includes(row.holidayDate));},upsert:async({where,create,update})=>{assert.equal(where.orgId_holidayDate.orgId,7);writes++;const old=rows.find(row=>row.holidayDate===where.orgId_holidayDate.holidayDate);if(old)Object.assign(old,update);else rows.push(create);}};
 const prisma={organizationHoliday:model,$queryRawUnsafe:async()=>[],$transaction:async fn=>{const before=structuredClone(rows);try{return await fn(prisma);}catch(error){rows=before;throw error;}}};
 const deps={ORG_MANAGEMENT_ROLES:['ADMIN','OPERATOR','ACCOUNTANT'],app:{get:(path,fn)=>routes.set('get:'+path,fn),put:(path,fn)=>routes.set('put:'+path,fn)},prisma,requireOrgRole:async(_req,_res,options)=>{assert.equal(options.allowSystemAdmin,false);return allowed?{organization:{id:7}}:null;},getCurrentRequestActorEmployeeId:()=>5,getRequesterEmail:()=> 'actor@example.test',normalizeHolidayDateKeyList:values=>[...new Set(values.filter(value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)))].sort(),assertCompanyLeaveBalances:async()=>{if(!balanceValid)throw Error('LEAVE_INSUFFICIENT_BALANCE');}};
 new Function(...Object.keys(deps),code)(...Object.values(deps));
 return {get:routes.get('get:/holidays'),put:routes.get('put:/holidays'),getRows:()=>rows,getWrites:()=>writes,setAllowed:value=>{allowed=value;},setBalanceValid:value=>{balanceValid=value;}};
}
const response=()=>({code:200,body:null,status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
test('holiday API preserves legacy dates and unpaid flags, defaults new dates to paid, and scopes every operation',async()=>{
 const f=fixture();let res=response();await f.get({query:{}},res);assert.deepEqual(res.body,['2026-11-02']);
 res=response();await f.get({query:{details:'1'}},res);assert.equal(res.body[0].isPaid,false);
 await f.put({query:{},body:{holidays:['2026-11-02','2026-11-03']}},response());assert.equal(f.getRows()[0].isPaid,false);assert.equal(f.getRows()[1].isPaid,true);
 res=response();await f.put({query:{details:'1'},body:{holidays:['2026-11-02'],holidayDetails:[{holidayDate:'2026-11-02',isPaid:true}]}},res);assert.equal(res.body[0].isPaid,true);
 const writes=f.getWrites();f.setAllowed(false);await f.put({query:{},body:{holidays:[]}},response());assert.equal(f.getWrites(),writes);
});
test('malformed pay status, impossible dates and calendar changes overdrawing annual leave never commit',async()=>{
 const f=fixture();for(const body of[{holidays:['2026-02-30']},{holidays:['invalid']},{holidays:['2026-11-02'],holidayDetails:[{holidayDate:'2026-11-02',isPaid:'false'}]},{holidays:['2026-11-02'],holidayDetails:[]}]){const res=response();await f.put({query:{},body},res);assert.equal(res.code,400);}assert.equal(f.getWrites(),0);
 f.setBalanceValid(false);await assert.rejects(f.put({query:{},body:{holidays:[]}},response()),/LEAVE_INSUFFICIENT_BALANCE/);assert.equal(f.getRows()[0].isPaid,false);assert.equal(f.getRows().length,1);
});
