const path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const {assertSafeApplicationDatabaseEnv}=require('../src/config/databaseTargetGuard');
const {PrismaClient}=require('@prisma/client');
const {missingSchema}=require('./railway-schema-preflight');
const {previewBrandTestAccess,applyBrandTestAccess,BRAND_TEST_EMAIL}=require('../dist/services/brandTestAccess');
async function run(){
 if(!process.env.DATABASE_URL&&!process.env.DIRECT_URL)throw new Error('BRAND_TEST_DATABASE_NOT_CONFIGURED');
 process.env.DATABASE_URL||=process.env.DIRECT_URL;process.env.DIRECT_URL||=process.env.DATABASE_URL;assertSafeApplicationDatabaseEnv(process.env);
 const db=new PrismaClient(),apply=process.argv.includes('--apply'),revision=process.argv.find(arg=>arg.startsWith('--revision='))?.slice(11);
 try{const missing=await missingSchema(db);if(missing.length)throw new Error('BRAND_TEST_SCHEMA_NOT_READY');
  const result=await db.$transaction(async tx=>{if(!apply)await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');return apply?applyBrandTestAccess(tx,BRAND_TEST_EMAIL,revision):previewBrandTestAccess(tx,BRAND_TEST_EMAIL);},{isolationLevel:'Serializable',timeout:30000});
  console.log(JSON.stringify({mode:apply?'APPLIED':'READ_ONLY_PLAN',...result},null,2));
 }finally{await db.$disconnect();}
}
if(require.main===module)run().catch(error=>{console.error(/^BRAND_TEST_/.test(error.message)?error.message:'BRAND_TEST_DATABASE_OR_VALIDATION_FAILED');process.exitCode=1;});
module.exports={run};
