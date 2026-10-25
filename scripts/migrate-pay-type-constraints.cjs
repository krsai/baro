// Schema-only repair, stdin credentials, rollback rehearsal unless --apply.
const {readFileSync}=require('node:fs');
const {createHash}=require('node:crypto');
const {PrismaClient}=require('../backend/node_modules/@prisma/client');
const {assertSafeApplicationDatabaseEnv}=require('../backend/src/config/databaseTargetGuard');
const version='20261025160000_pay_type_constraints';
const sql=readFileSync(`backend/prisma/migrations/${version}/migration.sql`,'utf8').replace(/\r\n/g,'\n');
const checksum=createHash('sha256').update(sql).digest('hex');
const tables=['SalaryItem','SalaryItemRate','SalarySystemVersion','EmployeeCompensationPolicy','EmployeePayTypePolicy','PayrollSnapshot'];
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);
process.stdin.on('end',async()=>{let db,report;try{
 const {DATABASE_PUBLIC_URL:url}=JSON.parse(input);assertSafeApplicationDatabaseEnv({DATABASE_URL:url,DIRECT_URL:url});
 db=new PrismaClient({datasourceUrl:url});const apply=process.argv.includes('--apply');
 await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout='10s'");
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(2026102002)');
  await tx.$executeRawUnsafe(`LOCK TABLE ${tables.map(t=>'"'+t+'"').join(',')} IN SHARE ROW EXCLUSIVE MODE`);
  const digest=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await tx.$queryRawUnsafe(`SELECT count(*)::int AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) AS digest FROM "${table}" t`))[0]])));
  const before=await digest();
  const applied=await tx.$queryRawUnsafe('SELECT checksum FROM "EntitySchemaMigration" WHERE version=$1',version);
  if(applied.length&&applied[0].checksum!==checksum)throw Error('CHECKSUM_MISMATCH');
  if(!applied.length){
   for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);
   await tx.$executeRawUnsafe('INSERT INTO "EntitySchemaMigration"(version,checksum) VALUES($1,$2)',version,checksum);
  }
  if(JSON.stringify(before)!==JSON.stringify(await digest()))throw Error('BUSINESS_DATA_CHANGED');
  const constraints=await tx.$queryRawUnsafe(`SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname IN ('SalaryItemRate_payType_check','EmployeeCompensationPolicy_payType_check','EmployeePayTypePolicy_payType_check') ORDER BY conname`);
  if(constraints.length!==3||constraints.some(c=>!c.definition.includes('OUTPUT_FIXED')))throw Error('CONSTRAINT_REPAIR_INCOMPLETE');
  report={version,mode:apply?'applied':'rollback-verified',alreadyApplied:!!applied.length,preservedTables:tables.length,constraints};
  if(!apply)throw Error('EXPECTED_ROLLBACK');
 },{timeout:60000});console.log(JSON.stringify(report));
}catch(error){if(error.message==='EXPECTED_ROLLBACK')console.log(JSON.stringify(report));else{console.error('PAY_TYPE_CONSTRAINT_REPAIR_FAILED '+(error.code||error.message));process.exitCode=1;}}finally{await db?.$disconnect();}});
