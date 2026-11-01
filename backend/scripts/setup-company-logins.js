const path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const {assertSafeApplicationDatabaseEnv}=require('../src/config/databaseTargetGuard');
const {PrismaClient}=require('@prisma/client');
const {previewCompanyLoginSplit,applyCompanyLoginSplit}=require('../dist/services/companyLoginSplit');
async function run(){
 const option=name=>process.argv.find(value=>value.startsWith('--'+name+'='))?.split('=').slice(1).join('=');
 if(!process.env.DATABASE_URL&&!process.env.DIRECT_URL)throw new Error('DATABASE_NOT_CONFIGURED');
 process.env.DATABASE_URL||=process.env.DIRECT_URL;process.env.DIRECT_URL||=process.env.DATABASE_URL;assertSafeApplicationDatabaseEnv(process.env);
 const input={orgId:Number(option('org-id')),personId:Number(option('person-id')),personalEmail:'krsailer82@gmail.com',sharedEmail:'baro.garment@gmail.com',revision:option('revision')};
 const apply=process.argv.includes('--apply'),db=new PrismaClient();
 try{const result=await db.$transaction(async tx=>{
  if(!apply)await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  return apply?applyCompanyLoginSplit(tx,input,'krsailer82@gmail.com'):previewCompanyLoginSplit(tx,input);
 },{isolationLevel:'Serializable',timeout:30000});console.log(JSON.stringify({mode:apply?'APPLIED':'READ_ONLY_PLAN',...result},null,2));}finally{await db.$disconnect();}
}
if(require.main===module)run().catch(error=>{console.error('Company login setup stopped: '+(error?.code||(/^COMPANY_|^INVALID_|^DATABASE_/.test(error?.message)?error.message:'database connection or validation unavailable')));process.exitCode=1;});
