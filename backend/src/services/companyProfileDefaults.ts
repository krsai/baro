import {createHttpError} from '../utils/http';

// Display data only. Identity, bank accounts and business history never enter a default.
export const partnerDisplayKeys=['contactName','contactPhone','email','address'];
export const profileSnapshot=(row:any)=>Object.fromEntries(partnerDisplayKeys.map(key=>[key,row?.[({contactName:'representative',contactPhone:'phone'} as any)[key]||key]??row?.[key]??null]));

export async function readCompanyProfileDefaults(db:any,ids:number[]){
 if(!ids.length)return [];
 return db.$queryRawUnsafe(`SELECT o.id AS "entityId",o."ownerOrgId",o."dataOwnerOrgId",o.name,o."nameKo",o."nameVi",o.representative,o.phone,o.email,o.address,
 d."registrationData",d.data AS "selfData",d."createdAt" AS "selfManagedAt",d."registrationOwnerOrgId",d.revision,
 (e."orgId"=o.id) AS "legacySelfManaged"
 FROM "Organization" o LEFT JOIN "CompanyProfileDefault" d ON d."entityId"=o.id
 LEFT JOIN "Employee" e ON e.id=o."updatedByEmployeeId" WHERE o.id=ANY($1::int[])`,ids);
}

export async function publishCompanyProfileDefault(tx:any,orgId:number,actorId:number,before:any,after:any){
 const keys=['representative','phone','email','address'];
 if(!keys.some(key=>(before?.[key]??null)!==(after?.[key]??null)))return;
 if(!await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:'ADMIN'},select:{id:true}}))throw createHttpError(403,'COMPANY_INDUSTRY_ADMIN_REQUIRED');
 // Keep the original registrar's baseline permanently. Later self-edits only
 // advance the company-owned default, never the original registration snapshot.
 await tx.$executeRawUnsafe(`INSERT INTO "CompanyProfileDefault"("entityId","registrationOwnerOrgId","registrationData",data,revision,"updatedByEmployeeId") VALUES($1,$2,$3::jsonb,$4::jsonb,1,$5)
 ON CONFLICT("entityId") DO UPDATE SET data=EXCLUDED.data,revision="CompanyProfileDefault".revision+1,"updatedByEmployeeId"=EXCLUDED."updatedByEmployeeId","updatedAt"=CURRENT_TIMESTAMP`,orgId,before?.ownerOrgId??before?.dataOwnerOrgId??null,JSON.stringify(profileSnapshot(before)),JSON.stringify(profileSnapshot(after)),actorId);
}
