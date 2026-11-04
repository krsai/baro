import {createHttpError} from '../utils/http';
const fail=(code='LEDGER_COUNTERPARTY_REQUIRED'):never=>{throw createHttpError(400,code);};
export const counterpartyInput=(value:any)=>{
 if(value==null)return null;
 if(!value||!['PARTNER','EMPLOYEE','ACCOUNT'].includes(value.kind)||value.kind!=='ACCOUNT'&&(!Number.isSafeInteger(value.id)||value.id<=0)||value.kind==='ACCOUNT'&&(typeof value.id!=='string'||!value.id||value.id.length>100))return fail('LEDGER_COUNTERPARTY_INVALID');
 return {kind:value.kind,id:value.id};
};
export const entryCounterparty=(row:any)=>row.counterpartyOrgId?{kind:'PARTNER',id:row.counterpartyOrgId,name:row.counterpartyName}:row.counterpartyEmployeeId?{kind:'EMPLOYEE',id:row.counterpartyEmployeeId,name:row.counterpartyName}:row.counterpartyAccountId?{kind:'ACCOUNT',id:row.counterpartyAccountId,name:row.counterpartyName}:null;
export async function ledgerCounterpartyOptions(db:any,orgId:number){
 const relationships=await db.orgRelationship.findMany({where:{OR:[{manufacturerOrgId:orgId},{brandOrgId:orgId}]},select:{manufacturerOrgId:true,brandOrgId:true}});
 const ids=relationships.map((r:any)=>r.manufacturerOrgId===orgId?r.brandOrgId:r.manufacturerOrgId);
 const [partners,employees,accounts]=await Promise.all([
  db.organization.findMany({where:{isActive:true,id:{not:orgId},OR:[{ownerOrgId:orgId},{id:{in:ids}}]},select:{id:true,name:true,nameKo:true,nameVi:true,code:true},orderBy:{name:'asc'}}),
  db.employee.findMany({where:{orgId,status:'ACTIVE'},select:{id:true,name:true,employeeNo:true},orderBy:{name:'asc'}}),
  db.organizationBankAccount.findMany({where:{orgId,entityId:orgId,isActive:true},include:{currency:true},orderBy:{sortOrder:'asc'}}),
 ]);
 return [...partners.map((p:any)=>({...p,kind:'PARTNER'})),...employees.map((p:any)=>({...p,kind:'EMPLOYEE'})),...accounts.map((a:any)=>({kind:'ACCOUNT',id:a.id,name:a.displayName||[a.bankName,a.accountNumber].filter(Boolean).join(' / '),currencyCode:a.currency.code}))];
}
export async function resolveLedgerCounterparty(tx:any,orgId:number,account:any,body:any,allocations:any[]){
 const supplied=counterpartyInput(body.counterparty);
 if(body.evidenceType==='ADJUSTMENT'){if(supplied)fail('LEDGER_COUNTERPARTY_INVALID');return {};}
 let party=supplied;
 if(allocations.length){
  const found:any[]=[];
  for(const allocation of allocations){
   if(allocation.invoiceId){const invoice=await tx.invoice.findFirst({where:{id:allocation.invoiceId,sellerOrgId:orgId},select:{buyerOrgId:true}});if(!invoice)fail('LEDGER_INVALID_EVIDENCE');found.push({kind:'PARTNER',id:invoice.buyerOrgId});}
   else{const cost=await tx.partnerTransactionCost.findFirst({where:{id:allocation.expenseItemId,orgId},select:{partnerOrgId:true,payeeEmployeeId:true}});if(!cost)fail('LEDGER_INVALID_EVIDENCE');found.push(cost.payeeEmployeeId?{kind:'EMPLOYEE',id:cost.payeeEmployeeId}:{kind:'PARTNER',id:cost.partnerOrgId});}
  }
  const first=found[0];if(!first?.id||found.some(p=>p.kind!==first.kind||p.id!==first.id)||supplied&&(supplied.kind!==first.kind||supplied.id!==first.id))fail('LEDGER_COUNTERPARTY_MISMATCH');party=first;
 }
 if(!party)fail();
 let name:string;
 if(party!.kind==='PARTNER'){
  const partner=await tx.organization.findFirst({where:{id:party!.id,...(!allocations.length?{isActive:true}:{})},select:{id:true,name:true,ownerOrgId:true}});if(!partner||partner.id===orgId)fail('LEDGER_COUNTERPARTY_INVALID');
  if(partner.ownerOrgId!==orgId&&!await tx.orgRelationship.findFirst({where:{OR:[{manufacturerOrgId:orgId,brandOrgId:partner.id},{brandOrgId:orgId,manufacturerOrgId:partner.id}]},select:{id:true}}))fail('LEDGER_COUNTERPARTY_INVALID');name=partner.name;
 }else if(party!.kind==='EMPLOYEE'){
  const employee=await tx.employee.findFirst({where:{id:party!.id,orgId,...(!allocations.length?{status:'ACTIVE'}:{})},select:{name:true}});if(!employee)fail('LEDGER_COUNTERPARTY_INVALID');name=employee.name;
 }else{
  const target=await tx.organizationBankAccount.findFirst({where:{id:party!.id,orgId,entityId:orgId,isActive:true},include:{currency:true}});if(!target||target.id===account.entityAccountId||'entity:'+target.id===account.id)fail('LEDGER_COUNTERPARTY_INVALID');name=target.displayName||[target.bankName,target.accountNumber].filter(Boolean).join(' / ');
 }
 return {counterpartyOrgId:party!.kind==='PARTNER'?party!.id:null,counterpartyEmployeeId:party!.kind==='EMPLOYEE'?party!.id:null,counterpartyAccountId:party!.kind==='ACCOUNT'?party!.id:null,counterpartyName:name!};
}
