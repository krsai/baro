const include={industries:{include:{industry:{include:{partnerRole:true}}}}};

export async function companyClassificationSource(db:any,companyId:number){
 if(!db.partnerClassification)return null;
 const own=await db.partnerClassification.findUnique({where:{orgId_entityId:{orgId:companyId,entityId:companyId}},include});
 if(own?.industries?.length)return {profile:own,source:'COMPANY'};
 const anchor=await db.organization.findFirst({where:{id:companyId,isActive:true},select:{ownerOrgId:true,dataOwnerOrgId:true}});
 const managerId=anchor?.ownerOrgId??anchor?.dataOwnerOrgId;
 if(managerId&&managerId!==companyId){
  const profile=await db.partnerClassification.findUnique({where:{orgId_entityId:{orgId:managerId,entityId:companyId}},include});
  if(profile?.industries?.length)return {profile,source:'SHARED'};
 }
 // A separately registered tenant can be linked to its original local entity.
 // Only the entity's actual manager may supply a fallback classification.
 const links=db.companyPartnerLink?await db.companyPartnerLink.findMany({where:{targetOrgId:companyId,entity:{isActive:true}},select:{orgId:true,entityId:true,entity:{select:{ownerOrgId:true,dataOwnerOrgId:true}}}}):[];
 const sources=links.filter((link:any)=>(link.entity.ownerOrgId??link.entity.dataOwnerOrgId)===link.orgId);
 const profiles=await Promise.all(sources.map((link:any)=>db.partnerClassification.findUnique({where:{orgId_entityId:{orgId:link.orgId,entityId:link.entityId}},include})));
 const registered=profiles.filter((profile:any)=>profile?.industries?.length);
 // Do not choose arbitrarily between registrations from different companies.
 return registered.length===1?{profile:registered[0],source:'SHARED'}:own?{profile:own,source:'COMPANY'}:null;
}
