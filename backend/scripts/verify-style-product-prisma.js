// Live Prisma transport check; never logs credentials or product payloads.
const path = require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const {PrismaClient}=require('@prisma/client');
const {assertSafeApplicationDatabaseEnv}=require('../src/config/databaseTargetGuard');
const {listStyleProducts,readStyleProduct,takeStyleProduct,createStyleProduct,updateStyleProduct}=require('../dist/services/styleProducts');
async function main(){
 assertSafeApplicationDatabaseEnv();
 const db=new PrismaClient({datasourceUrl:process.env.DIRECT_URL||process.env.DATABASE_URL});
 try{
  await db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
   const employee=await tx.employee.findFirst({where:{orgRole:'ADMIN',status:'ACTIVE',organization:{type:'MANUFACTURER',isActive:true}},select:{id:true,orgId:true}});
   if(!employee)throw Error('No active manufacturer administrator');
   const rows=await listStyleProducts(tx,employee.orgId,employee.id);
   if(rows.length)await readStyleProduct(tx,employee.orgId,employee.id,rows[0].id);
   console.log(JSON.stringify({ok:true,readOnly:true,products:rows.length}));
  },{timeout:30000});
  // Exercise actual Prisma transaction parameter binding on existing entries.
  // All calls are identical retries; always roll back the enclosing transaction.
  const rollback=Error('ROLLBACK_VERIFICATION');let checked=0;
  try{await db.$transaction(async tx=>{
   const employee=await tx.employee.findFirst({where:{orgRole:'ADMIN',status:'ACTIVE',organization:{type:'MANUFACTURER',isActive:true}},select:{id:true,orgId:true}});
   const rows=await listStyleProducts(tx,employee.orgId,employee.id);
   const row=rows.find(r=>r.customerOrgId);
   if(!row)throw Error('No connected product to verify');
   const product=await readStyleProduct(tx,employee.orgId,employee.id,row.id);
   const joined=new Proxy(tx,{get:(target,key)=>key==='$transaction'?(run=>run(tx)):Reflect.get(target,key)});
   await createStyleProduct(joined,employee.orgId,employee.id,{customerOrgId:row.customerOrgId,fields:product.fields});checked++;
   await updateStyleProduct(joined,employee.orgId,employee.id,row.id,{revision:product.revision,fields:product.fields});checked++;
   const existing=await tx.style.findFirst({where:{orgId:employee.orgId,productStyleId:row.id},select:{appliedProductRevision:true}});
   if(!existing)throw Error('Existing local style required for non-mutating verification');
   await takeStyleProduct(joined,employee.orgId,employee.id,row.id,{customerOrgId:row.customerOrgId,revision:existing.appliedProductRevision});checked++;
   throw rollback;
  },{timeout:30000});}catch(error){if(error!==rollback)throw error;}
  console.log(JSON.stringify({ok:true,prismaLifecycleChecks:checked,rolledBack:true}));
 }finally{await db.$disconnect();}
}
main().catch(error=>{const detail=String(error.meta?.message||'');console.error(JSON.stringify({ok:false,code:error.code||error.name,databaseCode:error.meta?.code,missingFunction:detail.match(/function [a-z_]+\([^)]*\) does not exist/i)?.[0]}));process.exitCode=1;});
