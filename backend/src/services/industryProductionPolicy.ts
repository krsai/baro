import { createHttpError } from '../utils/http';

export const industryIdForCode = (code: any) => code?.base?.serviceTypeId ?? code?.serviceType?.systemDefaultId ?? null;

export function applyIndustryProductionPolicy(code: any, required: boolean | null | undefined) {
  if (!code || required == null) return code;
  return { ...code, productionLinkRequired: required, base: { ...code.base,
    entryMode: required ? 'PROCESS' : 'GENERAL',
    orderInput: required ? 'REQUIRED' : 'OPTIONAL',
    styleInput: required ? 'REQUIRED' : 'OPTIONAL',
    processInput: required ? 'REQUIRED' : 'HIDDEN',
  } };
}

export function registerIndustryProductionPolicyRoutes(app: any, db: any, gates: any) {
  const path = '/app-settings/industry-production';
  app.get(path, async (req: any, res: any) => {
    const access = await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT']});
    if (!access) return;
    const [industries,policies] = await Promise.all([
      db.settingServiceDefault.findMany({where:{isActive:true,partnerRole:{code:'PROCESS_OUTSOURCING'}},orderBy:[{sortOrder:'asc'},{id:'asc'}]}),
      db.industryProductionPolicy.findMany({where:{orgId:access.organization.id}}),
    ]);
    res.json(industries.map((industry: any)=>({id:industry.id,nameKo:industry.nameKo,nameEn:industry.nameEn,nameVi:industry.nameVi,
      productionLinkRequired:policies.find((row: any)=>row.systemIndustryId===industry.id)?.productionLinkRequired ?? null})));
  });
  app.put(path, async (req: any, res: any) => {
    const access = await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN']});
    if (!access) return;
    const {systemIndustryId,productionLinkRequired} = req.body || {};
    if (!Number.isSafeInteger(systemIndustryId) || systemIndustryId<=0 || ![true,false,null].includes(productionLinkRequired)) throw createHttpError(400,'INVALID_INDUSTRY_PRODUCTION_POLICY');
    await db.$transaction(async (tx: any)=>{
      const industry = await tx.settingServiceDefault.findFirst({where:{id:systemIndustryId,isActive:true,partnerRole:{code:'PROCESS_OUTSOURCING'}}});
      if (!industry) throw createHttpError(400,'INVALID_INDUSTRY_PRODUCTION_POLICY');
      const orgId = access.organization.id;
      if (productionLinkRequired===null) await tx.industryProductionPolicy.deleteMany({where:{orgId,systemIndustryId}});
      else await tx.industryProductionPolicy.upsert({where:{orgId_systemIndustryId:{orgId,systemIndustryId}},
        create:{orgId,systemIndustryId,productionLinkRequired},update:{productionLinkRequired}});
    },{isolationLevel:'Serializable'});
    res.json({systemIndustryId,productionLinkRequired});
  });
}
