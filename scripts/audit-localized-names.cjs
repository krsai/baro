// Read-only audit. Credentials arrive on stdin and are never logged.
const {PrismaClient}=require('../backend/node_modules/@prisma/client');
const {assertSafeApplicationDatabaseEnv}=require('../backend/src/config/databaseTargetGuard');
const tables=['ProcessMasterOption','Organization','Factory','Warehouse','EmployeeGrade','SalaryItem','AttrColor','AttrCategory','AttrProcess','PriorCompletionReason','OutsourcingServiceType','TransactionCode','SettingServiceDefault','PartnerRole','SettingTransactionCodeDefault','TransactionCodeBase','ExpenseType','TaxTreatment'];
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);
process.stdin.on('end',async()=>{let db;try{
 const url=JSON.parse(input).DATABASE_PUBLIC_URL;
 assertSafeApplicationDatabaseEnv({DATABASE_URL:url,DIRECT_URL:url});
 db=new PrismaClient({datasourceUrl:url});
 const result=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const results=[];
  for(const table of tables){
   const rows=await tx.$queryRawUnsafe(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY id`);
   let missingEnglish=0,aliasMismatch=0,empty=0;const examples=[];
   for(const {row} of rows){const en=String(('nameEn' in row?row.nameEn:row.name)||'').trim(),ko=String(row.nameKo||'').trim(),vi=String(row.nameVi||'').trim(),legacy=String(row.name||row.label||'').trim(),base=en||ko||vi||legacy;
    if(!en)missingEnglish++;if(!base)empty++;
    if(('name' in row&&row.name!==base)||('label' in row&&row.label!==base))aliasMismatch++;
    if(examples.length<2&&(!en||('nameEn' in row&&row.name&&row.name!==base)))examples.push({id:row.id,name:row.name,nameEn:row.nameEn,nameKo:row.nameKo,nameVi:row.nameVi});
   }results.push({table,count:rows.length,missingEnglish,aliasMismatch,empty,examples});
  }
  const present=(await tx.$queryRawUnsafe(`SELECT to_regclass('"LocalizedNameMigrationAudit"') IS NOT NULL AS present`))[0].present;
  const migrationAudit=present?await tx.$queryRawUnsafe('SELECT "tableName",count(*)::int AS changed FROM "LocalizedNameMigrationAudit" GROUP BY "tableName" ORDER BY "tableName"'):[];
  return {tables:results,migrationAudit};
 },{timeout:60000});console.log(JSON.stringify(result,null,2));
}catch(e){console.error('LOCALIZED_NAME_AUDIT_FAILED '+(e.code||''));process.exitCode=1;}finally{if(db)await db.$disconnect();}});
