// Read-only source snapshot; writes are restricted to a disposable local database.
import { PrismaClient } from '../backend/node_modules/@prisma/client/default.js';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const sourceUrl=process.env.STYLE_IDENTITY_SOURCE_DATABASE_URL;
const localUrl=process.env.STYLE_IDENTITY_TEST_DATABASE_URL;
if(!sourceUrl||!localUrl) throw Error('Explicit read-only source and local test database URLs required');
const url=new URL(localUrl);
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw Error('Rehearsal target must be local');
const name=`style_fk_rehearsal_${randomUUID().replaceAll('-','')}`;
const adminUrl=new URL(url);adminUrl.pathname='/postgres';url.pathname=`/${name}`;
const source=new PrismaClient({datasourceUrl:sourceUrl});
const admin=new PrismaClient({datasourceUrl:adminUrl.toString()});
const db=new PrismaClient({datasourceUrl:url.toString()});
const cli=path.resolve('backend/node_modules/prisma/build/index.js');
const env={...process.env,DATABASE_URL:url.toString(),DIRECT_URL:url.toString()};
try {
  const snapshot=await source.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const organizations=await tx.$queryRawUnsafe('SELECT id,name,type FROM "Organization" ORDER BY id');
    const categories=await tx.$queryRawUnsafe('SELECT id,"orgId",code,name,"nameKo","nameEn","nameVi" FROM "AttrCategory" ORDER BY id');
    const masters=await tx.$queryRawUnsafe('SELECT id,type,code,label,"nameKo","nameEn","nameVi","sortOrder" FROM "ProcessMasterOption" ORDER BY id');
    const styles=await tx.$queryRawUnsafe('SELECT id,"orgId","customerOrgId",code,name,collection FROM "Style" ORDER BY id');
    const processes=await tx.$queryRawUnsafe('SELECT id,"orgId","styleId","sourceOrgId","processCode","processName","processComposition","isActive","ptSeconds","atParams","timesPerPiece" FROM "StyleProcess" ORDER BY id');
    return {organizations,categories,masters,styles,processes};
  },{isolationLevel:'RepeatableRead',timeout:30000});
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  execFileSync(process.execPath,[cli,'db','push','--skip-generate','--schema','prisma/schema.prisma'],{cwd:path.resolve('backend'),env,stdio:'pipe'});
  await db.organization.createMany({data:snapshot.organizations});
  await db.attrCategory.createMany({data:snapshot.categories});
  await db.processMasterOption.createMany({data:snapshot.masters});
  // Explicit copied IDs do not advance the disposable database's sequence.
  await db.$queryRawUnsafe(`SELECT setval(pg_get_serial_sequence('"ProcessMasterOption"','id'),(SELECT max(id) FROM "ProcessMasterOption"))`);
  await db.style.createMany({data:snapshot.styles});
  // Prisma's JsonNull represents stored JSON null rather than SQL NULL.
  const { Prisma } = await import('../backend/node_modules/@prisma/client/default.js');
  await db.styleProcess.createMany({data:snapshot.processes.map(p=>({...p,processComposition:p.processComposition??Prisma.DbNull,atParams:p.atParams??Prisma.DbNull}))});
  const sql=readFileSync('backend/scripts/style-identity-fk.sql','utf8');
  const run=()=>execFileSync(process.execPath,[cli,'db','execute','--stdin','--schema','prisma/schema.prisma'],{cwd:path.resolve('backend'),env,input:`BEGIN; ${sql} COMMIT;`,stdio:'pipe'});
  run();run();
  const saved=await db.styleProcess.findMany({orderBy:{id:'asc'}});
  for(let i=0;i<saved.length;i++) {
    const old=snapshot.processes[i],current=saved[i];
    for(const key of ['id','orgId','styleId','sourceOrgId','processCode','processName','isActive','ptSeconds','timesPerPiece']) {
      if(JSON.stringify(old[key])!==JSON.stringify(current[key])) throw Error(`Rehearsal changed protected field ${key}`);
    }
    if(JSON.stringify(old.atParams)!==JSON.stringify(current.atParams)) throw Error('Rehearsal changed AT parameters');
  }
  console.log(JSON.stringify({localRehearsal:true,sourceReadOnly:true,styles:snapshot.styles.length,processes:snapshot.processes.length,
    categoryLinks:await db.style.count({where:{categoryId:{not:null}}}),componentLinks:await db.styleProcessComponent.count(),
    repeatedMigration:true,processIdentityAndValuesPreserved:true}));
} catch(error) {
  console.error('Source rehearsal failed; credentials suppressed');process.exitCode=1;
  if(error.message?.startsWith('Rehearsal')) console.error(error.message);
} finally {
  await source.$disconnect();await db.$disconnect();
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);await admin.$disconnect();
}
