export function withDocumentNumbers(db,state){
 state.documentNumberCounters ||= {};
 const original=db.systemSetting.findUnique;
 db.systemSetting.findUnique=async args=>args.where.key.startsWith('DOCUMENT_NUMBER:')?(state.documentNumberCounters[args.where.key]||null):original(args);
 db.systemSetting.upsert=async({where,create,update})=>state.documentNumberCounters[where.key]={key:where.key,value:(state.documentNumberCounters[where.key]?update:create).value};
 const first=db.expenseRequest.findFirst;
 db.expenseRequest.findFirst=async args=>{
  const w=args.where;
  if(w.managementNumber!==undefined)return (state.documents||[]).find(row=>row.orgId===w.orgId&&(w.managementNumber===null?row.id===w.id&&row.managementNumber==null:String(row.managementNumber||'').toLowerCase()===w.managementNumber.equals.toLowerCase()))||null;
  return first(args);
 };
 return db;
}
