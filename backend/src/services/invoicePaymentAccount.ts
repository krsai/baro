import {createHttpError} from '../utils/http';
export async function listInvoicePaymentAccounts(db:any,orgId:number){
 return db.organizationBankAccount.findMany({where:{orgId,entityId:orgId,accountKind:'BANK',isActive:true},select:{id:true,bankName:true,accountNumber:true,accountHolder:true,swiftCode:true,updatedAt:true,currency:{select:{code:true}}},orderBy:[{sortOrder:'asc'},{createdAt:'asc'},{id:'asc'}]});
}

// Resolve an explicit account FK. Legacy document text is preserved verbatim.
export async function resolveInvoicePaymentAccount(db:any,orgId:number,fields:any){
 if(fields.bankAccountId===undefined)return;
 if(fields.bankAccountId===null){fields.bank='';delete fields.bankAccountSnapshot;delete fields.bankAccountRevision;return;}
 const id=fields.bankAccountId;
 if(typeof id!=='string'||!id||id.length>100)throw createHttpError(400,'INVOICE_BANK_ACCOUNT_INVALID');
 await db.$queryRawUnsafe('SELECT id FROM "OrganizationBankAccount" WHERE id=$1 AND "orgId"=$2 AND "entityId"=$2 FOR SHARE',id,orgId);
 const account=await db.organizationBankAccount.findFirst({where:{id,orgId,entityId:orgId,accountKind:'BANK',isActive:true},include:{currency:true}});
 if(!account)throw createHttpError(400,'INVOICE_BANK_ACCOUNT_INVALID');
 const revision=account.updatedAt?.toISOString?.()||String(account.updatedAt||'');
 if(fields.bankAccountRevision&&fields.bankAccountRevision!==revision)throw createHttpError(409,'INVOICE_BANK_ACCOUNT_CHANGED');
 fields.bankAccountRevision=revision;
 fields.bankAccountSnapshot={bankName:account.bankName,accountNumber:account.accountNumber,accountHolder:account.accountHolder,currencyCode:account.currency.code,swiftCode:account.swiftCode||''};
 fields.bank=['Bank Name: '+account.bankName,'Account Number: '+account.accountNumber,'Account Holder: '+account.accountHolder,'Currency: '+account.currency.code,'SWIFT Code: '+(account.swiftCode||'—')].join('\n');
}
