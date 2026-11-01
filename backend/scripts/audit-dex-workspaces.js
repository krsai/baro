// Read-only discovery before assigning explicit company/employee IDs to setup.
const path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const {assertSafeApplicationDatabaseEnv}=require('../src/config/databaseTargetGuard');
const {PrismaClient}=require('@prisma/client');
async function audit(){
 if(!process.env.DATABASE_URL&&!process.env.DIRECT_URL)throw new Error('DATABASE_NOT_CONFIGURED');
 process.env.DATABASE_URL||=process.env.DIRECT_URL;
 process.env.DIRECT_URL||=process.env.DATABASE_URL;
 assertSafeApplicationDatabaseEnv(process.env);
 const db=new PrismaClient();
 try{
  const result=await db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
   const emails=['krsailer82@gmail.com','baro.garment@gmail.com'];
   const [organizations,employees,systemUsers]=await Promise.all([
    tx.organization.findMany({where:{OR:[{name:{contains:'DEX',mode:'insensitive'}},{name:{contains:'BARO',mode:'insensitive'}}]},select:{id:true,name:true,code:true,type:true,ownerOrgId:true,country:true,salaryCurrencyId:true},orderBy:{id:'asc'}}),
    tx.employee.findMany({where:{email:{in:emails}},select:{id:true,orgId:true,name:true,email:true,orgRole:true,status:true,factoryId:true,gradeId:true,employeeNo:true,payrollExcluded:true,alwaysFullAttendance:true},orderBy:{id:'asc'}}),
    tx.systemUser.findMany({where:{email:{in:emails}},select:{email:true,systemRole:true}}),
   ]);
   return {mode:'READ_ONLY',organizations,employees,systemUsers};
  },{timeout:15000});
  console.log(JSON.stringify(result,null,2));
 }finally{await db.$disconnect();}
}
if(require.main===module)audit().catch(error=>{console.error('DEX account audit unavailable ('+(error?.code||error?.errorCode||(error?.message==='DATABASE_NOT_CONFIGURED'?'DATABASE_NOT_CONFIGURED':error?.name||'CONNECTION_FAILED'))+'). No database changes were attempted.');process.exitCode=1;});
module.exports={audit};
