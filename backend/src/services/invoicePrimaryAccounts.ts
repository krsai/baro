export async function invoicePrimaryAccountText(db:any,orgId:number){
 await db.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
 const rows=await db.organizationBankAccount.findMany({where:{orgId,entityId:orgId,accountKind:'BANK',isActive:true,isDefault:true},include:{currency:true},orderBy:[{sortOrder:'asc'},{createdAt:'asc'},{id:'asc'}]});
 return rows.map((row:any)=>[row.bankName,row.accountNumber,row.accountHolder,row.currency.code].filter(Boolean).join(' / ')).join('\n');
}
