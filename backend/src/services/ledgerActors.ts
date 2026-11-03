// Resolve exact recorded login identities only inside the current company.
export async function attachLedgerActorNames(db:any,orgId:number,rows:any[]){
 const emails=[...new Set(rows.flatMap(row=>[row,...(row.settlementLines||[])]).map(row=>String(row.createdBy||'').trim().toLowerCase()).filter(email=>email.includes('@')&&email.length<=320))];
 const employees=emails.length?await db.employee.findMany({where:{orgId,email:{in:emails,mode:'insensitive'}},select:{email:true,name:true}}):[];
 const names=new Map<string,string|null>();
 for(const employee of employees){const email=employee.email?.trim().toLowerCase();if(email)names.set(email,names.has(email)?null:employee.name);}
 const name=(row:any)=>names.get(String(row.createdBy||'').trim().toLowerCase())||null;
 return rows.map(row=>({...row,createdByName:name(row),settlementLines:(row.settlementLines||[]).map((detail:any)=>({...detail,createdByName:name(detail)}))}));
}
