import {createHttpError} from '../utils/http';

// Accounting classification is shared by requests and bank transactions. IDs remain unchanged.
export const ACCOUNTING_CODE_INCLUDE={serviceType:true,taxTreatment:true,base:{include:{expenseType:true,variants:true}}};
export function resolveAccountingCode(row:any){
 const base=row?.base,tax=row?.taxTreatment;
 const source=base?.variants?.find((variant:any)=>variant.taxTreatmentId===row.taxTreatmentId&&variant.isActive&&variant.isEnabled);
 if(base?.expenseType?.code==='OTHER'||!row?.isActive||!base?.isActive||!base.expenseType?.isActive||!tax||!source)return null;
 return {...row,code:base.code+tax.suffix,nameKo:base.nameKo,nameEn:base.nameEn,nameVi:base.nameVi,vatEnabled:tax.code==='VAT',systemSourceId:source.id};
}
export function accountingCodeId(value:any,required=false):number|null{
 if(value==null||value===''){if(required)throw createHttpError(400,'LEDGER_ACCOUNTING_CODE_REQUIRED');return null;}
 if(!Number.isSafeInteger(value)||value<=0)throw createHttpError(400,'LEDGER_ACCOUNTING_CODE_INVALID');
 return value;
}
export async function ledgerAccountingCode(tx:any,orgId:number,id:number){
 const code=resolveAccountingCode(await tx.transactionCode.findFirst({where:{id,ownerOrgId:orgId,isActive:true},include:ACCOUNTING_CODE_INCLUDE}));
 if(!code)throw createHttpError(400,'LEDGER_ACCOUNTING_CODE_INVALID');
 const description=[code.base.expenseType.nameEn,code.base.nameEn||code.nameEn||code.code].filter(Boolean).join(' - ');
 return {id:code.id,description:description.slice(0,1000)};
}
