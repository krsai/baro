import {attachLinkedCompanies} from './companyConnections';

// Callers supply company-scoped invoice rows. Resolve each actual buyer FK once
// with the same DEFAULT/LOCAL display policy as the partner directory.
export async function loadInvoiceBuyerNames(db:any,orgId:number,rows:any[]){
 const buyers=new Map<number,any>();
 for(const row of rows){
  if(row.sellerOrgId===orgId&&Number.isSafeInteger(row.buyerOrgId)&&row.buyer?.id===row.buyerOrgId){
   buyers.set(row.buyerOrgId,{...row.buyer,entityId:row.buyerOrgId});
  }
 }
 if(!buyers.size)return new Map<number,any>();
 const profiles=await attachLinkedCompanies(db,orgId,[...buyers.values()]);
 // Contact/default/identity metadata is internal to the resolver, never list data.
 return new Map<number,any>(profiles.map((profile:any)=>[profile.entityId,{
  name:profile.name??null,nameKo:profile.nameKo??null,nameVi:profile.nameVi??null,
 }]));
}
