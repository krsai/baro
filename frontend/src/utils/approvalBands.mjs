const scale=currency=>currency==='USD'?2:0;
export function approvalAmountUnits(value,currency){
 const digits=scale(currency),text=String(value??'');
 if(!(digits?/^\d{1,15}(?:\.\d{1,2})?$/:/^\d{1,15}$/).test(text))return null;
 const [whole,fraction='']=text.split('.');return BigInt(whole)*10n**BigInt(digits)+BigInt(fraction.padEnd(digits,'0')||'0');
}
const amountText=(units,currency)=>{const digits=scale(currency);if(!digits)return String(units);return String(units/100n)+'.'+String(units%100n).padStart(2,'0');};
export function previousApprovalAmount(value,currency){const units=approvalAmountUnits(value,currency);return units!=null&&units>0n?amountText(units-1n,currency):'0';}
export const sameApprovalGroup=(row,group)=>row.currency===group.currency&&row.drafterRole===group.role&&(row.drafterGradeId||null)===(group.gradeId||null);
export const boundedApprovalBand=row=>!!row.__bounded||row.max!==null&&row.max!==undefined&&row.max!=='';
export function defaultApprovalBands(settings,grades,group){
 const grade=code=>grades.find(row=>row.code===code)?.id||null;
 const senior={role:'ACCOUNTANT',gradeId:settings.fallbackGrades?.senior||settings.seniorGradeId||grade('CL2')};
 const lead={role:'ACCOUNTANT',gradeId:settings.fallbackGrades?.lead||settings.leadGradeId||grade('CL3')};
 const admin={role:'ADMIN',gradeId:null},limits=settings.limits[group.currency];
 if(!limits?.senior||!limits?.lead)return [];
 // This is a view of the existing fallback, not a write or an inferred new rule.
 // Self-authority depends on the drafter's grade and stays with the server.
 const ranges=group.role==='OPERATOR'?[{max:limits.senior,stages:[senior]},{max:limits.lead,stages:[senior,lead]},{max:null,stages:[senior,lead,admin]}]:[];
 return reflowApprovalBands(ranges.map((row,index)=>({...row,id:`band-${group.role}-${group.gradeId||0}-${group.currency}-${index}`,name:`${group.currency} / ${group.role} / ${index+1}`,drafterRole:group.role,drafterGradeId:group.gradeId||null,currency:group.currency,min:'0',stages:row.stages.map(stage=>({...stage}))})),group.currency);
}
export function reflowApprovalBands(rows,currency){
 let min='0';return rows.map(row=>{const next={...row,min};const max=approvalAmountUnits(row.max,currency);if(boundedApprovalBand(row)&&max!==null)min=amountText(max+1n,currency);return next;});
}
export function replaceApprovalGroup(rules,group,rows){
 const rest=rules.filter(row=>!sameApprovalGroup(row,group));
 // Specific drafter grades precede the all-grade fallback in the same currency.
 let index=rest.findIndex(row=>row.currency===group.currency&&row.drafterRole===group.role&&!row.drafterGradeId);
 if(index<0)index=rest.length;
 if(!group.gradeId){const last=rest.findLastIndex(row=>row.currency===group.currency&&row.drafterRole===group.role&&row.drafterGradeId);if(last>=0)index=Math.max(index,last+1);}
 return [...rest.slice(0,index),...rows,...rest.slice(index)];
}
export function invalidApprovalBands(rules){
 if(rules.length>30)return true;
 if(approvalBandOrderErrors(rules).size)return true;
 return rules.some(row=>{
  const min=approvalAmountUnits(row.min,row.currency),max=boundedApprovalBand(row)?approvalAmountUnits(row.max,row.currency):null;
  if(min===null||boundedApprovalBand(row)&&(max===null||max<min)||!row.stages?.length||row.stages.length>10||row.drafterRole==='OPERATOR'&&!row.stages.some(stage=>stage.role==='ACCOUNTANT'))return true;
  return row.stages.some(stage=>!stage.role||stage.role!=='ADMIN'&&!stage.gradeId);
 });
}
export const cleanApprovalBands=rules=>rules.map(({__bounded,...row})=>row);
export function combineApprovalCurrencyRows(groups){
 const combined=new Map();
 for(const {currency,rows} of groups)rows.forEach((rule,index)=>{
  const signature=JSON.stringify(rule.stages.map(stage=>[stage.role,stage.gradeId||null]));
  const key=index+':'+boundedApprovalBand(rule)+':'+signature;
  if(!combined.has(key))combined.set(key,{index,stages:rule.stages,entries:[]});
  combined.get(key).entries.push({currency,index,rule});
 });
 return [...combined.values()].sort((a,b)=>a.index-b.index).map(row=>({...row,key:row.entries.map(entry=>entry.currency+':'+(entry.rule.id??entry.index)).join('|')}));
}
export function approvalBandOrderErrors(rules){
 const groups=new Map(),errors=new Set();
 for(const row of rules){const key=JSON.stringify([row.currency,row.drafterRole,row.drafterGradeId||null]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 for(const rows of groups.values()){
  let previous=null,unlimited=null;
  for(const row of rows){
   if(unlimited){errors.add(unlimited.id);errors.add(row.id);}
   if(!boundedApprovalBand(row)){unlimited=row;continue;}
   const amount=approvalAmountUnits(row.max,row.currency);if(amount===null)continue;
   if(previous&&amount<=previous.amount){errors.add(previous.id);errors.add(row.id);}
   previous={id:row.id,amount};
  }
 }
 return errors;
}
export function reorderApprovalCurrencyBands(rules,groups,rows,from,to){
 if(from===to||from<0||to<0||from>=rows.length||to>=rows.length)return rules;
 const ordered=[...rows],moved=ordered.splice(from,1)[0];ordered.splice(to,0,moved);
 let result=rules;
 for(const source of groups){
  const entries=ordered.flatMap(row=>row.entries.filter(entry=>entry.currency===source.currency));
  const next=[...entries.filter(entry=>boundedApprovalBand(entry.rule)),...entries.filter(entry=>!boundedApprovalBand(entry.rule))].map(entry=>entry.rule);
  if(next.some((row,index)=>row!==source.rows[index]))result=replaceApprovalGroup(result,source.group,reflowApprovalBands(next,source.currency));
 }
 return result;
}
export function reorderApprovalStages(stages,from,to){
 if(from===to||from<0||to<0||from>=stages.length||to>=stages.length)return stages;
 const next=[...stages];next.splice(to,0,next.splice(from,1)[0]);return next;
}
