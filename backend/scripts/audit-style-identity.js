const { PrismaClient } = require('@prisma/client');
async function audit(db) {
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const total=await tx.$queryRawUnsafe('SELECT count(*)::INT count FROM "Style"');
    const categories = await tx.$queryRawUnsafe(`SELECT s.id,s."orgId",s.collection,count(a.id)::int candidates
      FROM "Style" s LEFT JOIN "AttrCategory" a ON a."orgId"=s."orgId" AND a.name=btrim(s.collection)
      WHERE coalesce(btrim(s.collection),'')<>'' GROUP BY s.id ORDER BY s.id`);
    const masters = await tx.$queryRawUnsafe('SELECT id,type,code FROM "ProcessMasterOption"');
    const processes = await tx.$queryRawUnsafe('SELECT id,"processComposition" FROM "StyleProcess" WHERE "processComposition" IS NOT NULL');
    const issues = [], counts = { references: 0, custom: 0 };
    const kinds = { locations:'LOCATION',location:'LOCATION',parts:'PART',part:'PART', targets:'TARGET',target:'TARGET',targetSpecs:'TARGET_SPEC',targetSpec:'TARGET_SPEC',specs:'SPEC', actions:'ACTION',action:'ACTION',actionSpecs:'ACTION_SPEC',actionSpec:'ACTION_SPEC' };
    function walk(value, type, path, id) {
      if (Array.isArray(value)) return value.forEach((v,i)=>walk(v,type,`${path}/${i}`,id));
      if (!value || typeof value!=='object') return;
      if (type && ('code' in value || 'label' in value || 'nameKo' in value)) {
        counts.references++;
        const code=String(value.code||'').trim().toUpperCase();
        const sameIdentity=m=>value.masterOptionId ? m.id===Number(value.masterOptionId) : String(m.code).trim().toUpperCase()===code&&code;
        let matches=masters.filter(m=>m.type===type&&sameIdentity(m));
        if (!matches.length && (type==='PART'||type==='SPEC')) matches=masters.filter(m=>m.type===(type==='PART'?'LOCATION':'TARGET_SPEC')&&sameIdentity(m));
        if (matches.length!==1) {
          if (!matches.length && value.isCustom && !value.masterOptionId) counts.custom++;
          else issues.push({processId:id,path,type,code,candidates:matches.length});
        }
        return;
      }
      Object.entries(value).forEach(([k,v])=>walk(v,kinds[k]||type,`${path}/${k}`,id));
    }
    processes.forEach(p=>walk(p.processComposition,null,'',p.id));
    return { styleCount: total[0].count, categorizedStyles:categories.length, categoryIssues: categories.filter(c=>c.candidates!==1), processCount: processes.length, ...counts, componentIssues:issues };
  }, { timeout: 30000 });
}
if(require.main===module) {
  const db=new PrismaClient({datasourceUrl:process.env.DIRECT_URL||process.env.DATABASE_URL});
  audit(db).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Read-only identity audit failed; credentials suppressed');process.exitCode=1;}).finally(()=>db.$disconnect());
}
module.exports={audit};
