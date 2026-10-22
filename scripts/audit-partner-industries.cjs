// Read-only production audit. Railway variables are consumed from stdin and
// never printed or persisted. Never falls back to this PC's authentication DB.
const {PrismaClient}=require('../backend/node_modules/@prisma/client');
const {assertSafeApplicationDatabaseEnv}=require('../backend/src/config/databaseTargetGuard');
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);
process.stdin.on('end',async()=>{
 let db;
 try{
  const variables=JSON.parse(input),url=variables.DATABASE_PUBLIC_URL;
  if(!url)throw Error('Railway public business database URL unavailable');
  assertSafeApplicationDatabaseEnv({DATABASE_URL:url,DIRECT_URL:url});
  db=new PrismaClient({datasourceUrl:url});
  const result=await db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
   const queries={
    defaults:'SELECT s.id,s.code,s."nameKo",s."nameEn",s."nameVi",r.code AS role FROM "SettingServiceDefault" s LEFT JOIN "PartnerRole" r ON r.id=s."partnerRoleId" ORDER BY s.id',
    locals:'SELECT s.id,s."ownerOrgId",s.code,s."nameKo",s."systemDefaultId",s."isOverridden",(SELECT count(*)::int FROM "OrganizationOutsourcingServiceType" p WHERE p."serviceTypeId"=s.id) AS partners FROM "OutsourcingServiceType" s ORDER BY s."ownerOrgId",s.id',
    assignments:'SELECT p.*,o.type,s."systemDefaultId" FROM "OrganizationOutsourcingServiceType" p JOIN "Organization" o ON o.id=p."partnerOrgId" JOIN "OutsourcingServiceType" s ON s.id=p."serviceTypeId" AND s."ownerOrgId"=p."ownerOrgId" ORDER BY p."ownerOrgId",p."partnerOrgId",p."serviceTypeId"',
    codeEvidence:'SELECT DISTINCT c."ownerOrgId",c."serviceTypeId" AS local,b."serviceTypeId" AS "baseSource",d."serviceTypeId" AS "codeSource" FROM "TransactionCode" c LEFT JOIN "TransactionCodeBase" b ON b.id=c."baseId" LEFT JOIN "SettingTransactionCodeDefault" d ON d.id=c."systemDefaultId" ORDER BY c."ownerOrgId",c."serviceTypeId"',
    customers:'SELECT r.id,r."manufacturerOrgId",r."brandOrgId",o.type,o.industry,(to_jsonb(r)->>\'systemIndustryId\')::int AS "systemIndustryId" FROM "OrgRelationship" r JOIN "Organization" o ON o.id=r."brandOrgId" ORDER BY r.id',
   };
   const result={readOnly:true};for(const[key,sql]of Object.entries(queries))result[key]=await tx.$queryRawUnsafe(sql);return result;
  },{timeout:30000});
  console.log(JSON.stringify(result,null,2));
 }catch(error){console.error('Business database audit failed; connection details suppressed. '+(error.code||''));process.exitCode=1;}
 finally{if(db)await db.$disconnect();}
});
