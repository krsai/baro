import {createHttpError} from '../utils/http';
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
// Same order/style/process basis as the work-log quantity check. Do not parse notes
// or compare a sum of different processes with one finished-garment quantity.
const source=`WITH records AS (
 SELECT r."orgId",r."assignmentPlanId",r."styleId",r."styleProcessId",r.quantity,r.id AS "recordId",r."workLogId",r."workerId",NULL::text AS "vendorName",'EMPLOYEE' AS kind FROM "WorkRecord" r WHERE r."orgId"=$1
 UNION ALL SELECT r."orgId",r."assignmentPlanId",r."styleId",r."styleProcessId",r.quantity,r.id AS "recordId",r."workLogId",NULL::integer AS "workerId",r."outsourceVendorName" AS "vendorName",'OUTSOURCING' AS kind FROM "OutsourcedWorkRecord" r WHERE r."orgId"=$1
), scoped AS (
 SELECT r.*,p."workOrderId",w."orderNumber",s.code AS "styleCode",s.name AS "styleName",sp."processCode",sp."processName",sp."genderScope",l."workDate",l."coverageStartDate",l."coverageEndDate",l."factoryId"
 FROM records r JOIN "AssignmentPlan" p ON p.id=r."assignmentPlanId" AND p."orgId"=r."orgId" AND p."styleId"=r."styleId"
 JOIN "WorkOrder" w ON w.id=p."workOrderId" AND w."orgId"=r."orgId"
 JOIN "Style" s ON s.id=r."styleId" AND s."orgId"=r."orgId"
 JOIN "StyleProcess" sp ON sp.id=r."styleProcessId" AND sp."styleId"=r."styleId" AND sp."orgId"=r."orgId"
 JOIN "WorkLog" l ON l.id=r."workLogId" AND l."orgId"=r."orgId"
 WHERE ($2::integer IS NULL OR p."workOrderId"=$2) AND ($3::integer IS NULL OR r."styleId"=$3) AND ($4::integer IS NULL OR r."styleProcessId"=$4)
)`;
async function actor(db:any,orgId:number,actorId:number){
 if(!Number.isSafeInteger(orgId)||orgId<=0||!Number.isSafeInteger(actorId)||actorId<=0)fail('PRODUCTION_EXCESS_ACCESS_DENIED',403);
 const person=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','OPERATOR','ACCOUNTANT']},organization:{type:'MANUFACTURER',isActive:true,ownerOrgId:null}}});
 if(!person)fail('PRODUCTION_EXCESS_ACCESS_DENIED',403);return person;
}
export function classifyProductionExcess(rows:any[],quantities:Map<string,any>,targetForProcess:(process:any,quantity:any)=>number){
 let unverified=0;
 const groups=rows.flatMap(row=>{
  const quantity=quantities.get(row.workOrderId+':'+row.styleId)||{total:0,male:0,female:0,unisex:0,unspecified:0};
  if(quantity.unspecified>0&&(row.genderScope||'UNISEX')!=='UNISEX'){unverified++;return [];}
  const target=targetForProcess(row,quantity),recorded=Number(row.recorded),excess=recorded-target;
  return [{...row,target,recorded,excess,recordCount:Number(row.recordCount),excessPercent:target>0?excess/target*100:null}];
 });
 return {groups,unverified};
}
async function groups(db:any,orgId:number,gates:any,scope:any={}){
 const rows=await db.$queryRawUnsafe(source+` SELECT "workOrderId","orderNumber","styleId","styleCode","styleName","styleProcessId","processCode","processName","genderScope",sum(quantity)::text AS recorded,count(*)::integer AS "recordCount",max(COALESCE("coverageEndDate","workDate")) AS "lastDate" FROM scoped GROUP BY "workOrderId","orderNumber","styleId","styleCode","styleName","styleProcessId","processCode","processName","genderScope"`,orgId,scope.orderId??null,scope.styleId??null,scope.processId??null);
 const quantities=await gates.loadQuantities([...new Set(rows.map((r:any)=>r.workOrderId))],db);
 return classifyProductionExcess(rows,quantities,gates.targetForProcess);
}
function pagination(query:any){const page=Number(query.page||0),pageSize=Number(query.pageSize||5);if(!Number.isSafeInteger(page)||page<0||page>100000||![5,20,50].includes(pageSize))fail('PRODUCTION_EXCESS_INVALID_QUERY');return {page,pageSize};}
export async function productionExcessList(db:any,orgId:number,actorId:number,query:any,gates:any){
 await actor(db,orgId,actorId);const {page,pageSize}=pagination(query),result=await groups(db,orgId,gates);
 const alerts=result.groups.filter(row=>row.excess>0).sort((a,b)=>b.excess-a.excess||String(b.lastDate).localeCompare(String(a.lastDate))||a.workOrderId-b.workOrderId||a.styleId-b.styleId||a.styleProcessId-b.styleProcessId);
 return {rows:alerts.slice(page*pageSize,(page+1)*pageSize),total:alerts.length,unverified:result.unverified,page,pageSize};
}
export async function productionExcessDetail(db:any,orgId:number,actorId:number,scope:any,query:any,gates:any){
 await actor(db,orgId,actorId);if(![scope.orderId,scope.styleId,scope.processId].every(id=>Number.isSafeInteger(id)&&id>0))fail('PRODUCTION_EXCESS_INVALID_QUERY');
 if(!(await db.$queryRawUnsafe('SELECT id FROM "WorkOrder" WHERE id=$1 AND "orgId"=$2',scope.orderId,orgId)).length)fail('PRODUCTION_EXCESS_NOT_FOUND',404);
 const {page,pageSize}=pagination({...query,pageSize:query.pageSize||20}),result=await groups(db,orgId,gates,scope),group=result.groups[0]||null;
 const records=await db.$queryRawUnsafe(source+` SELECT r."recordId",r."workLogId",r.kind,r."workDate",r."coverageStartDate",r."coverageEndDate",r.quantity,r."assignmentPlanId",COALESCE(e.name,r."vendorName",'') AS name,f.name AS "factoryName",count(*) OVER()::integer AS "totalRecords" FROM scoped r LEFT JOIN "Employee" e ON e.id=r."workerId" AND e."orgId"=r."orgId" LEFT JOIN "Factory" f ON f.id=r."factoryId" AND f."orgId"=r."orgId" ORDER BY COALESCE(r."coverageEndDate",r."workDate") DESC,r."workLogId" DESC,r.quantity DESC,r.kind,r."recordId" LIMIT $5 OFFSET $6`,orgId,scope.orderId,scope.styleId,scope.processId,pageSize,page*pageSize);
 return {group,resolved:group!==null?group.excess<=0:result.unverified===0,unverified:result.unverified,records,total:records[0]?.totalRecords||0,page,pageSize};
}
export function registerProductionExcessRoutes(app:any,db:any,gates:any){
 const route=(path:string,detail=false)=>app.get(path,async(req:any,res:any)=>{
  const access=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT'],allowSystemAdmin:false});if(!access)return;
  const orgId=access.organization.id,actorId=gates.actorId(),person=await actor(db,orgId,actorId);
  if(!await gates.canAccess({orgType:'MANUFACTURER',orgRole:person.orgRole,feature:'DASHBOARD'})||!await gates.canAccess({orgType:'MANUFACTURER',orgRole:person.orgRole,feature:'WORK_HISTORY'}))fail('PRODUCTION_EXCESS_ACCESS_DENIED',403);
  res.json(detail?await productionExcessDetail(db,orgId,actorId,{orderId:Number(req.params.orderId),styleId:Number(req.params.styleId),processId:Number(req.params.processId)},req.query,gates):await productionExcessList(db,orgId,actorId,req.query,gates));
 });
 route('/work-logs/production-excess');route('/work-logs/production-excess/:orderId/:styleId/:processId',true);
}
