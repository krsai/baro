import {createHttpError} from '../utils/http';
import {freightForwarder} from './freightOperations';

const fail=(code:string,status=409):never=>{throw createHttpError(status,code);};
export function shippingChargeReference(input:any){
 if(input?.shippingChargeId===undefined)return null;
 if(typeof input.shippingChargeId!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(input.shippingChargeId)||!Number.isSafeInteger(input.shippingChargeVersion)||input.shippingChargeVersion<1)fail('SHIPPING_INVALID',400);
 return {shippingChargeId:input.shippingChargeId,shippingChargeVersion:input.shippingChargeVersion};
}
export async function shippingChargeSource(db:any,orgId:number,actorId:number,chargeId:string){
 await freightForwarder(db,orgId,actorId);
 const [row]=await db.$queryRawUnsafe(`SELECT c.*,c.amount::text AS amount,c.quantity::text AS quantity,c."unitPrice"::text AS "unitPrice",j.number AS "jobNumber",j."customerId",l."invoiceDraftId",l."invoiceId",l."expenseRequestId" FROM "ShippingChargeDraft" c JOIN "FreightJob" j ON j.id=c."jobId" AND j."orgId"=c."orgId" LEFT JOIN "ShippingChargeFinancialLink" l ON l."chargeId"=c.id WHERE c.id=$1 AND c."orgId"=$2 AND c."billId" IS NULL AND j."receiptStatus"='ACCEPTED' AND j.status<>'CANCELLED'`,chargeId,orgId);
 if(!row)fail('SHIPPING_NOT_FOUND',404);
 return {id:row.id,version:row.version,jobId:row.jobId,jobNumber:row.jobNumber,direction:row.direction,partyId:row.partyId??(row.direction==='SALES'?row.customerId:null),description:row.description,currencyCode:row.currencyCode,quantity:row.quantity||'1',unitPrice:row.unitPrice??row.amount,amount:row.amount,invoiceDraftId:row.invoiceDraftId||null,invoiceId:row.invoiceId||null,expenseRequestId:row.expenseRequestId||null};
}
export async function linkShippingCharge(db:any,orgId:number,reference:any,direction:string,target:{invoiceDraftId?:string;expenseRequestId?:number}){
 if(!reference)return;
 const [charge]=await db.$queryRawUnsafe(`SELECT c.* FROM "ShippingChargeDraft" c JOIN "FreightJob" j ON j.id=c."jobId" AND j."orgId"=c."orgId" WHERE c.id=$1 AND c."orgId"=$2 AND c."billId" IS NULL AND j."receiptStatus"='ACCEPTED' AND j.status<>'CANCELLED' FOR UPDATE OF c`,reference.shippingChargeId,orgId);
 if(!charge||charge.direction!==direction)fail('SHIPPING_CHARGE_DOCUMENT_SCOPE');
 if(charge.version!==reference.shippingChargeVersion)fail('SHIPPING_CHANGED');
 if(target.invoiceDraftId){const draft=await db.invoiceDraft.findFirst({where:{id:target.invoiceDraftId,sellerOrgId:orgId}});const job=await db.freightJob.findFirst({where:{id:charge.jobId,orgId}});if(!draft||draft.buyerOrgId!==(charge.partyId??job?.customerId))fail('SHIPPING_CHARGE_DOCUMENT_SCOPE');}
 if(target.expenseRequestId&&charge.partyId){const expense=await db.expenseRequest.findFirst({where:{id:target.expenseRequestId,orgId}});if(expense?.partnerOrgId!==charge.partyId)fail('SHIPPING_CHARGE_DOCUMENT_SCOPE');}
 const [existing]=await db.$queryRawUnsafe('SELECT * FROM "ShippingChargeFinancialLink" WHERE "chargeId"=$1 FOR UPDATE',charge.id);
 if(existing&&(existing.invoiceId||existing.invoiceDraftId&&existing.invoiceDraftId!==target.invoiceDraftId||existing.expenseRequestId&&existing.expenseRequestId!==target.expenseRequestId))fail('SHIPPING_CHARGE_DOCUMENT_LINKED');
 await db.$executeRawUnsafe(`INSERT INTO "ShippingChargeFinancialLink"("chargeId","orgId","jobId","chargeVersion","invoiceDraftId","expenseRequestId") VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT("chargeId") DO UPDATE SET "chargeVersion"=EXCLUDED."chargeVersion","invoiceDraftId"=EXCLUDED."invoiceDraftId","expenseRequestId"=EXCLUDED."expenseRequestId"`,charge.id,orgId,charge.jobId,charge.version,target.invoiceDraftId||null,target.expenseRequestId||null);
}
