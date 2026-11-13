import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const {classifyProductionExcess,productionExcessList,productionExcessDetail,registerProductionExcessRoutes}=createRequire(import.meta.url)('../backend/dist/services/productionExcess');
const target=(process,q)=>process.genderScope==='MALE_ONLY'?q.male:process.genderScope==='FEMALE_ONLY'?q.female:q.total;

test('per-process targets distinguish gender, normal split work, removed styles and unknown gender',()=>{
 const quantities=new Map([['1:10',{total:100,male:40,female:60,unspecified:0}],['2:20',{total:100,male:0,female:0,unspecified:100}]]);
 const rows=[{workOrderId:1,styleId:10,styleProcessId:1,genderScope:'UNISEX',recorded:'100',recordCount:3},{workOrderId:1,styleId:10,styleProcessId:2,genderScope:'MALE_ONLY',recorded:'41',recordCount:2},{workOrderId:1,styleId:10,styleProcessId:3,genderScope:'FEMALE_ONLY',recorded:'60',recordCount:2},{workOrderId:1,styleId:99,styleProcessId:4,genderScope:'UNISEX',recorded:'5',recordCount:1},{workOrderId:2,styleId:20,styleProcessId:5,genderScope:'MALE_ONLY',recorded:'90',recordCount:1}];
 const result=classifyProductionExcess(rows,quantities,target);assert.equal(result.unverified,1);assert.deepEqual(result.groups.filter(r=>r.excess>0).map(r=>[r.styleProcessId,r.target,r.excess]),[[2,40,1],[4,0,5]]);assert.equal(result.groups[3].excessPercent,null);
});

test('dashboard queries aggregate all months, assignments, employees and outsourcing without reading remarks or changing data',async()=>{
 const pg=new PGlite();try{
  await pg.exec(`CREATE TABLE "WorkOrder"(id INT PRIMARY KEY,"orgId" INT,"orderNumber" TEXT);
   CREATE TABLE "Style"(id INT PRIMARY KEY,"orgId" INT,code TEXT,name TEXT);
   CREATE TABLE "StyleProcess"(id INT PRIMARY KEY,"styleId" INT,"orgId" INT,"processCode" TEXT,"processName" TEXT,"genderScope" TEXT);
   CREATE TABLE "AssignmentPlan"(id INT PRIMARY KEY,"orgId" INT,"workOrderId" INT,"styleId" INT,"isCompleted" BOOLEAN NOT NULL DEFAULT FALSE,"productionCompletedAt" TIMESTAMP,"completedAt" TIMESTAMP,"closedAt" TIMESTAMP,"scheduleStatus" TEXT);
   CREATE TABLE "WorkLog"(id INT PRIMARY KEY,"orgId" INT,"workDate" TEXT,"coverageStartDate" TEXT,"coverageEndDate" TEXT,"factoryId" INT,note TEXT);
   CREATE TABLE "Employee"(id INT PRIMARY KEY,"orgId" INT,name TEXT);
   CREATE TABLE "Factory"(id INT PRIMARY KEY,"orgId" INT,name TEXT);
   CREATE TABLE "WorkRecord"(id INT PRIMARY KEY,"orgId" INT,"assignmentPlanId" INT,"styleId" INT,"styleProcessId" INT,quantity INT,"workLogId" INT,"workerId" INT);
   CREATE TABLE "OutsourcedWorkRecord"(id INT PRIMARY KEY,"orgId" INT,"assignmentPlanId" INT,"styleId" INT,"styleProcessId" INT,quantity INT,"workLogId" INT,"outsourceVendorName" TEXT);
   CREATE TABLE targets("orderId" INT,"styleId" INT,total INT,male INT,female INT,unspecified INT);
   INSERT INTO "WorkOrder" VALUES(1,7,'L16-1'),(2,7,'L18-1'),(3,8,'PRIVATE');
   INSERT INTO "Style" VALUES(10,7,'AM01622','Shirt'),(20,7,'AM01160','Shirt 2'),(30,8,'PRIVATE','Private');
   INSERT INTO "StyleProcess" VALUES(100,10,7,'TS05','Sew collar','UNISEX'),(101,10,7,'NORMAL','Normal','UNISEX'),(200,20,7,'TS01','Sew','UNISEX'),(300,30,8,'PRIVATE','Private','UNISEX');
   INSERT INTO "AssignmentPlan"(id,"orgId","workOrderId","styleId") VALUES(11,7,1,10),(12,7,1,10),(21,7,2,20),(31,8,3,30);
   INSERT INTO "Factory" VALUES(1,7,'HANOI');INSERT INTO "Employee" VALUES(1,7,'Worker A'),(2,7,'Worker B'),(3,8,'Private');
   INSERT INTO "WorkLog" VALUES(1,7,'2026-05-31',NULL,NULL,1,'No warning'),(2,7,'2026-11-02',NULL,NULL,1,'No warning'),(3,7,'2026-11-03',NULL,NULL,1,'Old warning text must not be used'),(4,8,'2026-11-03',NULL,NULL,NULL,'Private');
   INSERT INTO targets VALUES(1,10,440,440,0,0),(2,20,1084,1084,0,0);
   INSERT INTO "WorkRecord" VALUES(1,7,11,10,100,440,1,1),(2,7,12,10,100,300,2,2),(3,7,11,10,101,200,1,1),(4,7,12,10,101,240,2,2),(5,7,21,20,200,1084,1,1),(6,7,21,20,200,1140,2,2),(7,8,31,30,300,999999,4,3);
   INSERT INTO "OutsourcedWorkRecord" VALUES(1,7,12,10,100,50,3,'Vendor A');`);
  let writes=0;
  const db={$queryRawUnsafe:async(sql,...values)=>{if(!/^(WITH|SELECT)/.test(sql.trim()))writes++;return (await pg.query(sql,values)).rows;},employee:{findFirst:async({where})=>where.id===1&&where.orgId===7?{id:1,orgRole:'OPERATOR'}:null}};
  const gates={targetForProcess:target,loadQuantities:async()=>new Map((await pg.query('SELECT * FROM targets')).rows.map(row=>[row.orderId+':'+row.styleId,row]))};
  const initial=await productionExcessList(db,7,1,{pageSize:5},gates);assert.equal(initial.total,2);assert.deepEqual(initial.rows.map(r=>[r.orderNumber,r.recorded,r.target,r.excess]),[['L18-1',2224,1084,1140],['L16-1',790,440,350]]);
  const detail=await productionExcessDetail(db,7,1,{orderId:1,styleId:10,processId:100},{},gates);assert.equal(detail.total,3);assert.equal(detail.records[0].kind,'OUTSOURCING');assert.equal(detail.records[0].name,'Vendor A');assert.equal(detail.records[2].workDate,'2026-05-31');assert.equal(detail.group.recordCount,3);
  const second=await productionExcessDetail(db,7,1,{orderId:1,styleId:10,processId:100},{page:1,pageSize:5},gates);assert.equal(second.records.length,0);
  const recordsBefore=await pg.query('SELECT * FROM "WorkRecord" ORDER BY id');
  for(const completion of ['"isCompleted"=TRUE','"productionCompletedAt"=CURRENT_TIMESTAMP','"completedAt"=CURRENT_TIMESTAMP','"closedAt"=CURRENT_TIMESTAMP',`"scheduleStatus"='PRODUCTION_COMPLETED'`]){
   await pg.exec(`UPDATE "AssignmentPlan" SET ${completion} WHERE id=21`);
   const filtered=await productionExcessList(db,7,1,{},gates);assert.equal(filtered.total,1);assert.equal(filtered.rows[0].workOrderId,1);
   const completed=await productionExcessDetail(db,7,1,{orderId:2,styleId:20,processId:200},{},gates);assert.equal(completed.resolved,true);assert.equal(completed.total,0);
   await pg.exec('UPDATE "AssignmentPlan" SET "isCompleted"=FALSE,"productionCompletedAt"=NULL,"completedAt"=NULL,"closedAt"=NULL,"scheduleStatus"=NULL WHERE id=21');
   assert.equal((await productionExcessList(db,7,1,{},gates)).total,2);
  }
  assert.deepEqual((await pg.query('SELECT * FROM "WorkRecord" ORDER BY id')).rows,recordsBefore.rows);
  await pg.exec('UPDATE "AssignmentPlan" SET "isCompleted"=TRUE WHERE id=12');
  assert.equal((await productionExcessList(db,7,1,{},gates)).total,1,'completed employee and outsourced assignments are both excluded');
  const activeOnly=await productionExcessDetail(db,7,1,{orderId:1,styleId:10,processId:100},{},gates);assert.equal(activeOnly.total,1);assert.equal(activeOnly.group.recorded,440);assert.equal(activeOnly.resolved,true);
  await pg.exec('UPDATE "AssignmentPlan" SET "isCompleted"=FALSE WHERE id=12');
  await assert.rejects(productionExcessList(db,7,999,{},gates),/ACCESS_DENIED/);await assert.rejects(productionExcessList(db,7,undefined,{},gates),/ACCESS_DENIED/);await assert.rejects(productionExcessDetail(db,7,1,{orderId:3,styleId:30,processId:300},{},gates),/NOT_FOUND/);
  await pg.exec('UPDATE "WorkRecord" SET quantity=0 WHERE id=2; DELETE FROM "OutsourcedWorkRecord" WHERE id=1');
  assert.equal((await productionExcessList(db,7,1,{},gates)).total,1);assert.equal((await productionExcessDetail(db,7,1,{orderId:1,styleId:10,processId:100},{},gates)).resolved,true);
  await pg.exec('UPDATE targets SET total=300 WHERE "orderId"=1');assert.equal((await productionExcessList(db,7,1,{},gates)).total,3,'order reductions also reveal existing excess');assert.equal(writes,0);
  const routes=new Map();registerProductionExcessRoutes({get:(path,handler)=>routes.set(path,handler)},db,{...gates,requireOrgRole:async()=>({organization:{id:7}}),actorId:()=>1,canAccess:async({feature})=>feature!=='WORK_HISTORY'});
  await assert.rejects(routes.get('/work-logs/production-excess')({query:{}},{json:()=>assert.fail('denied role must not read data')}),/ACCESS_DENIED/);
 }finally{await pg.close();}
});
