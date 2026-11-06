import {randomUUID} from 'node:crypto';

// A connected subscriber's self-declared profile supersedes a separately saved
// local classification. Non-subscribers and self profiles remain real usage.
export async function supersededPartnerClassifications(db:any,ids:number[]){
 if(!ids.length)return [];
 return db.$queryRawUnsafe(`WITH linked AS (
 SELECT l.*,p.revision AS "localRevision",COALESCE(i."anchorEntityId",c."targetOrgId",
 CASE WHEN EXISTS(SELECT 1 FROM "OrgRelationship" r WHERE
 (r."manufacturerOrgId"=l."orgId" AND r."brandOrgId"=l."entityId") OR
 (r."brandOrgId"=l."orgId" AND r."manufacturerOrgId"=l."entityId")) THEN l."entityId" END) AS "targetOrgId"
 FROM "PartnerClassificationIndustry" l JOIN "PartnerClassification" p USING("orgId","entityId")
 LEFT JOIN "CompanyIdentityLink" il ON il."orgId"=l."orgId" AND il."entityId"=l."entityId"
 LEFT JOIN "CompanyIdentity" i ON i.id=il."identityId"
 LEFT JOIN "CompanyPartnerLink" c ON c."orgId"=l."orgId" AND c."entityId"=l."entityId"
 WHERE l."systemIndustryId"=ANY($1::int[]) AND l."orgId"<>l."entityId")
 SELECT l.*,p.revision AS "officialRevision" FROM linked l
 JOIN "Organization" o ON o.id=l."targetOrgId"
 JOIN "PartnerClassification" p ON p."orgId"=o.id AND p."entityId"=o.id
 WHERE o."ownerOrgId" IS NULL AND (o."dataOwnerOrgId" IS NULL OR o."dataOwnerOrgId"=o.id)
 AND o."isActive" AND o.type::text IN ('MANUFACTURER','BRAND','SERVICE')
 AND EXISTS(SELECT 1 FROM "Employee" e WHERE e."orgId"=o.id AND e.status::text='ACTIVE')
 AND EXISTS(SELECT 1 FROM "PartnerClassificationIndustry" current WHERE current."orgId"=o.id AND current."entityId"=o.id)
 AND NOT EXISTS(SELECT 1 FROM "PartnerClassificationIndustry" current WHERE current."orgId"=o.id AND current."entityId"=o.id AND current."systemIndustryId"=l."systemIndustryId")`,ids);
}

export function effectiveIndustryUsage(rows:any[],superseded:any[]){
 return rows.map(row=>{
  const stale=superseded.filter(link=>link.systemIndustryId===row.id);
  if(!stale.length)return row;
  return {...row,_count:{...row._count,partnerClassifications:Math.max(0,row._count.partnerClassifications-stale.length)},
   partnerClassifications:row.partnerClassifications?.filter((link:any)=>!stale.some(old=>old.orgId===link.orgId&&old.entityId===link.entityId))};
 });
}

// Called only by an explicit SYSTEM delete, in its transaction. Reads never
// modify profiles. Other FK guards can still roll back this entire cleanup.
export async function removeSupersededPartnerClassifications(tx:any,industryId:number){
 const candidates=await supersededPartnerClassifications(tx,[industryId]);
 if(!candidates.length)return;
 const lockIds=[...new Set<number>(candidates.flatMap((row:any)=>[row.orgId,row.entityId,row.targetOrgId]))].sort((a,b)=>a-b);
 await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',lockIds);
 const stale=(await supersededPartnerClassifications(tx,[industryId])).filter((row:any)=>candidates.some((original:any)=>original.orgId===row.orgId&&original.entityId===row.entityId&&original.targetOrgId===row.targetOrgId));
 for(const row of stale){
  await tx.partnerClassificationIndustry.deleteMany({where:{orgId:row.orgId,entityId:row.entityId,systemIndustryId:industryId}});
  if(await tx.partnerClassificationIndustry.count({where:{orgId:row.orgId,entityId:row.entityId}})){
   await tx.partnerClassification.updateMany({where:{orgId:row.orgId,entityId:row.entityId},data:{revision:{increment:1}}});
  }else await tx.partnerClassification.deleteMany({where:{orgId:row.orgId,entityId:row.entityId}});
 }
 if(stale.length)await tx.systemSetting.create({data:{key:'SUPERSEDED_PARTNER_CLASSIFICATION:'+randomUUID(),updatedBy:'SYSTEM_INDUSTRY_DELETION',value:{industryId,removed:stale,createdAt:new Date().toISOString()}}});
}
