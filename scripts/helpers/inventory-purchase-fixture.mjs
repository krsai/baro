import {seedExpenseVariant} from './expense-variant-fixture.mjs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url);
const {registerExpenseRequest}=require('../../backend/dist/services/expenseRequest');
export async function seedInventoryPurchase(db,seed,masterId,actorId=seed.people.admin.id){
 const selection=await seedExpenseVariant(db,seed,masterId,actorId);
 const doc=await db.$transaction(tx=>registerExpenseRequest(tx,seed.company.id,actorId,{partnerOrgId:seed.vendor.id,requestDate:'2026-11-19',clientKey:randomUUID(),items:[{transactionCodeId:seed.code.id,...selection,currency:'USD',quantity:'100',unitPrice:'1',vatRate:'0',details:{evidenceFile:'purchase.pdf'}}]}));
 const item=await db.partnerTransactionCost.findFirst({where:{orgId:seed.company.id,expenseRequestId:doc.id}});
 const request=await db.expenseRequest.findUnique({where:{id:doc.id}});
 return {expenseItemId:item.id,expenseRequestVersion:request.version};
}
