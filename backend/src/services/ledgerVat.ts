import {Prisma} from '@prisma/client';
import {createHttpError} from '../utils/http';
export const ledgerTaxInput=(row:any)=>row.subtotal==null&&row.vatRate==null&&row.vatAmount==null?{}:{subtotal:row.subtotal,vatRate:row.vatRate,...(row.vatAmount==null?{}:{vatAmount:row.vatAmount})};
export async function ledgerTaxSnapshot(db:any,orgId:number,codeId:number|null,body:any,currency:string){
 if(body.subtotal==null&&body.vatRate==null&&body.vatAmount==null)return {};
 const fail=():never=>{throw createHttpError(400,'LEDGER_INVALID_VAT');};
 if(!/^\d{1,20}(\.\d{1,4})?$/.test(String(body.subtotal))||!/^\d{1,3}(\.\d{1,2})?$/.test(String(body.vatRate)))return fail();
 const subtotal=new Prisma.Decimal(body.subtotal),rate=new Prisma.Decimal(body.vatRate),precision=currency==='USD'?2:0;
 if(subtotal.lte(0)||rate.gt(100)||!subtotal.eq(subtotal.toDecimalPlaces(precision)))return fail();
 const code=codeId?await db.transactionCode.findFirst({where:{id:codeId,ownerOrgId:orgId},select:{taxTreatment:{select:{suffix:true}}}}):null;
 if(!code?.taxTreatment||code.taxTreatment.suffix!=='V'&&!rate.eq(0))return fail();
 const vatAmount=subtotal.mul(rate).div(100).toDecimalPlaces(precision,Prisma.Decimal.ROUND_HALF_UP);
 if(!/^\d+(\.\d{1,4})?$/.test(String(body.amount))||!subtotal.add(vatAmount).eq(body.amount))return fail();
 if(body.vatAmount!=null&&(!/^\d+(\.\d{1,4})?$/.test(String(body.vatAmount))||!vatAmount.eq(body.vatAmount)))return fail();
 return {subtotal:subtotal.toString(),vatRate:rate.toString(),vatAmount:vatAmount.toString()};
}
