const {createHash}=require('node:crypto');
function employeeCodePlan(organization,employees,fromCode){
 const code=organization.code?.trim().toUpperCase();
 if(!code||!fromCode||code===fromCode)throw Error('INVALID_CODE_CHANGE');
 const used=new Set(),changes=[];
 for(const row of employees){
  const current=row.employeeNo;
  let next=current;
  if(current?.startsWith(fromCode)){
   const digits=current.slice(fromCode.length);
   if(!/^\d{4}$/.test(digits))throw Error('EMPLOYEE_NUMBER_REVIEW_REQUIRED');
   next=code+digits;
  }
  if(next){const key=next.toUpperCase();if(used.has(key))throw Error('EMPLOYEE_NUMBER_COLLISION');used.add(key);}
  if(next!==current)changes.push({id:row.id,before:current,after:next});
 }
 return {orgId:organization.id,code,fromCode,changes,revision:createHash('sha256').update(JSON.stringify([organization.id,code,employees.map(e=>[e.id,e.employeeNo])])).digest('hex')};
}
module.exports={employeeCodePlan};
