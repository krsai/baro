// Suggestions only: a nearby measurement never changes item identity.
const numbers=value=>(String(value||'').match(/\d+(?:\.\d+)?/g)||[]).map(Number);
export function rankMaterialCandidates(rows,text,ownerId){
 const wanted=numbers(text),query=String(text||'').normalize('NFKC').trim().toLocaleLowerCase();
 const score=row=>{
  const type=row.attributes?.type||{},name=type.nameEn||type.nameKo||type.nameVi||'',actual=numbers(name);
  let rank=ownerId&&row.attributes?.owner?.id!==ownerId?100:0;
  if(query&&[type.nameEn,type.nameKo,type.nameVi].some(v=>String(v||'').normalize('NFKC').trim().toLocaleLowerCase()===query))return rank-10;
  if(wanted.length&&wanted.length===actual.length)rank+=wanted.reduce((sum,n,i)=>sum+Math.abs(n-actual[i])/Math.max(1,Math.abs(n)),0);
  else rank+=10;
  return rank;
 };
 return rows.map((row,index)=>({row,index,score:score(row)})).sort((a,b)=>a.score-b.score||a.index-b.index).map(({row})=>row);
}
