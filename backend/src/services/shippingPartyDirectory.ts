import {createHttpError} from '../utils/http';
const fields=['name','nameKo','nameVi','country','businessNumber','address','contactName','phone','email'];
const dto=(row:any)=>({id:row.id,...Object.fromEntries(fields.map(key=>[key,row[key]??''])),directoryParty:true});
// A directory choice grants only a shipping-party reference, never customer or accounting access.
export async function directoryShippingParty(db:any,orgId:number,id:number){
 const rows=await db.$queryRawUnsafe(`SELECT o.id,o.name,o."nameKo",o."nameVi",o.country,o."businessNumber",o.address,o.representative AS "contactName",o.phone,o.email
 FROM "Organization" o WHERE o.id=$1 AND o.id<>$2 AND o."isActive" AND
 ((o."ownerOrgId" IS NULL AND o.type::text IN ('MANUFACTURER','BRAND','SERVICE') AND EXISTS(SELECT 1 FROM "Employee" e WHERE e."orgId"=o.id AND e.status::text='ACTIVE'))
 OR EXISTS(SELECT 1 FROM "CompanyIdentity" c WHERE c."anchorEntityId"=o.id))`,id,orgId);
 if(!rows.length)throw createHttpError(403,'FREIGHT_PARTY_SCOPE');return dto(rows[0]);
}
export async function searchShippingCompanies(db:any,orgId:number,query:string){
 const term=String(query||'').trim();if(term.length<2||term.length>100)throw createHttpError(400,'COMPANY_LOOKUP_INPUT_REQUIRED');
 const pattern='%'+term.replace(/[\\%_]/g,'\\$&')+'%',number=term.toUpperCase().replace(/[^A-Z0-9]/g,'');
 const rows=await db.$queryRawUnsafe(`SELECT o.id,o.name,o."nameKo",o."nameVi",o.country,o."businessNumber",o.address,o.representative AS "contactName",o.phone,o.email
 FROM "Organization" o WHERE o.id<>$1 AND o."isActive" AND
 ((o."ownerOrgId" IS NULL AND o.type::text IN ('MANUFACTURER','BRAND','SERVICE') AND EXISTS(SELECT 1 FROM "Employee" e WHERE e."orgId"=o.id AND e.status::text='ACTIVE'))
 OR EXISTS(SELECT 1 FROM "CompanyIdentity" c WHERE c."anchorEntityId"=o.id)) AND
 (o.name ILIKE $2 OR o."nameKo" ILIKE $2 OR o."nameVi" ILIKE $2 OR ($3<>'' AND regexp_replace(upper(o."businessNumber"),'[^A-Z0-9]','','g') LIKE '%'||$3||'%'))
 ORDER BY o.name,o.id LIMIT 21`,orgId,pattern,number);
 return rows.map(dto);
}
export async function recentShippingParties(db:any,orgId:number,customerId:number){
 const rows=await db.$queryRawUnsafe(`SELECT DISTINCT ON (p.id) p.id,p.name,p."nameKo",p."nameVi",p.country,p."businessNumber",j.data->(r.role||'Party') AS snapshot
 FROM "FreightJob" j CROSS JOIN (VALUES ('shipper'),('consignee'),('notify')) r(role)
 JOIN "Organization" p ON p.id::text=j.data->>(r.role||'Id')
 WHERE j."orgId"=$1 AND j."customerId"=$2 AND p."isActive" AND p.id<>$1 AND p.id<>$2
 ORDER BY p.id,j."updatedAt" DESC,j.id DESC LIMIT 100`,orgId,customerId);
 return rows.map((row:any)=>({...dto({...row,...Object.fromEntries(['name','country','address','contactName','phone','email'].filter(key=>typeof row.snapshot?.[key]==='string').map(key=>[key,row.snapshot[key]]))}),recentShippingParty:true}));
}
