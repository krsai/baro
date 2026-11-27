import {freightForwarder} from './freightOperations';
import {shippingWorkData} from './shippingWorkData';
import {companyIndustryMenuFeatures} from './industryMenuPolicy';
import {createHttpError} from '../utils/http';

// Internal forwarder report: never reuse this response for SR customer sharing.
export async function logisticsStatusReport(db:any,orgId:number,actorId:number,input:any={}){
 await freightForwarder(db,orgId,actorId);
 const offset=Number(input.offset||0),customerId=Number(input.customerId||0),include=input.includeCompleted==='true';
 const search=typeof input.search==='string'?input.search.trim():'';
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000||!Number.isSafeInteger(customerId)||customerId<0||input.search!==undefined&&typeof input.search!=='string'||search.length>160||input.includeCompleted!==undefined&&!['true','false'].includes(input.includeCompleted))throw createHttpError(400,'FREIGHT_INVALID_INPUT');
 const [result]=await db.$queryRawUnsafe(`WITH scoped AS (
  SELECT j.id,j.number,j."customerId",j.mode,j.service,j.status,j."createdAt",j.data,
   (SELECT jsonb_agg(jsonb_build_object('id',b.id,'number',b.number,'etd',b.data->>'etd','eta',b.data->>'eta') ORDER BY b."createdAt",b.id)
    FROM "FreightJobMaster" l JOIN "FreightBill" b ON b.id=l."masterBillId" AND b."orgId"=l."orgId"
    WHERE l."orgId"=j."orgId" AND l."jobId"=j.id AND l."deletedAt" IS NULL AND b."deletedAt" IS NULL AND b.kind='MASTER') AS schedules,
   COALESCE(data,'{}'::jsonb)||COALESCE(data->'workDetails','{}'::jsonb) AS work
  FROM "FreightJob" j WHERE j."orgId"=$1 AND j."receiptStatus"='ACCEPTED' AND j.status<>'CANCELLED'
 ), filtered AS (
  SELECT *,CASE WHEN schedules IS NOT NULL THEN (SELECT min(NULLIF(s->>'eta','')) FROM jsonb_array_elements(schedules) s) ELSE NULLIF(work->>'eta','') END AS "sortDate"
  FROM scoped WHERE ($2 OR status<>'DELIVERED') AND ($3=0 OR "customerId"=$3)
  AND ($4='' OR strpos(lower(concat_ws(' ',number,data->'customer'->>'name',data->'customer'->>'nameKo',data->'customer'->>'nameVi',work->>'cargo',work->>'origin',work->>'destination',work->>'remark')),lower($4))>0)
 ), page AS (
  SELECT * FROM filtered ORDER BY "customerId","sortDate" NULLS LAST,"createdAt",id LIMIT 50 OFFSET $5
 ) SELECT (SELECT count(*)::integer FROM filtered) AS total,
 COALESCE((SELECT jsonb_agg(p ORDER BY p."customerId",p."sortDate" NULLS LAST,p."createdAt",p.id) FROM page p),'[]'::jsonb) AS rows,
 COALESCE((SELECT jsonb_agg(c ORDER BY c.id) FROM (SELECT DISTINCT ON ("customerId") "customerId" AS id,data->'customer'->>'name' AS name,data->'customer'->>'nameKo' AS "nameKo",data->'customer'->>'nameVi' AS "nameVi" FROM scoped ORDER BY "customerId","createdAt" DESC,id) c),'[]'::jsonb) AS customers`,orgId,include,customerId,search,offset);
 return {total:result.total,offset,customers:result.customers,rows:result.rows.map((row:any)=>{
  const work=shippingWorkData(row.data||{}),customer=row.data?.customer||{};
  return {id:row.id,number:row.number,customerId:row.customerId,customer:{name:customer.name,nameKo:customer.nameKo,nameVi:customer.nameVi},mode:row.mode,service:row.service,status:row.status,
   cargoReadyDate:work.plannedDate||null,shipmentType:work.shipmentType||null,chargeableWeightKg:work.chargeableWeightKg??null,vehicleCount:work.vehicleCount??null,jobType:row.data?.jobType||row.data?.direction||'OTHER',schedules:row.schedules?.length?row.schedules:[{etd:work.etd||null,eta:work.eta||null}],deliveryDate:row.status==='DELIVERED'?row.data?.deliveryDate||null:null,
   cargo:work.cargo||'',origin:work.origin||'',destination:work.destination||'',remark:work.remark||'',quantity:work.quantity??null,unit:work.unit||'',weightKg:work.weightKg??null,cbm:work.cbm??null,
   containers:Array.isArray(work.containers)?work.containers.map((c:any)=>({size:c.size,type:c.type,count:c.count})):[],containerType:work.containerType||'',containerCount:work.containerCount??null};
 })};
}

export function registerLogisticsStatusRoutes(app:any,db:any,gates:any){
 app.get('/logistics-status-reports',async(req:any,res:any)=>{
  const context=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT'],allowSystemAdmin:false});if(!context)return;
  const orgId=context.organization.id,role=context.employee.orgRole,policy=await gates.loadPolicy();
  if(context.organization.type!=='SERVICE'||!policy.policy?.SERVICE?.[role]?.includes('PRODUCTION_STATUS')||!(await companyIndustryMenuFeatures(db,orgId,'SERVICE')).includes('PRODUCTION_STATUS'))throw createHttpError(403,'FEATURE_ACCESS_DENIED');
  res.json(await logisticsStatusReport(db,orgId,gates.actorId(),req.query));
 });
}
