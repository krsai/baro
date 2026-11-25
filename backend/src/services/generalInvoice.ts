import {invoiceCurrencyTotals,totalGeneralInvoiceCurrencies} from './invoiceCurrencies';
import {companyInvoiceParty} from './companyDocumentContact';
import {prepareMaterialSelection} from './materialItems';
import {resolveInvoicePaymentAccount,invoiceBankLinks} from './invoicePaymentAccount';
import {Prisma} from '@prisma/client';
import {createHttpError} from '../utils/http';
import {calculateRequestAmounts} from './transactionRequest';
import {companyBillableCode} from './companyIndustries';
import {publicCompanyFields} from './companyIdentity';
import {attachLinkedCompanies} from './companyConnections';
import {cashScheduleDate} from './cashSchedule';
import {allocateDocumentNumber,normalizeDocumentNumber} from './documentNumber';

const invalid=(code='GENERAL_INVOICE_INVALID'):never=>{throw createHttpError(400,code);};
export const generalInvoiceBuyerScope=(sellerOrgId:number)=>({isActive:true,id:{not:sellerOrgId},OR:[{ownerOrgId:sellerOrgId},{buyerWorkOrders:{some:{sellerOrgId}}}]});
const party=companyInvoiceParty;
export async function generalInvoiceSource(db:any,sellerOrgId:number,buyerOrgId:number){
 if(!Number.isSafeInteger(buyerOrgId)||buyerOrgId<=0)return invalid();
 const [seller,localBuyer]=await Promise.all([
  db.organization.findFirst({where:{id:sellerOrgId,isActive:true},select:publicCompanyFields}),
  db.organization.findFirst({where:{AND:[generalInvoiceBuyerScope(sellerOrgId),{id:buyerOrgId}]},select:publicCompanyFields}),
 ]);
 if(!seller||!localBuyer)return invalid('GENERAL_INVOICE_BUYER_INVALID');
 const [buyer]=await attachLinkedCompanies(db,sellerOrgId,[{...localBuyer,entityId:localBuyer.id}]);
 const accounts=await db.organizationBankAccount.findMany({where:{orgId:sellerOrgId,entityId:sellerOrgId,accountKind:'BANK'},select:{id:true,isDefault:true,isActive:true,bankName:true,accountNumber:true,accountHolder:true,swiftCode:true,updatedAt:true,currency:{select:{code:true}}},orderBy:[{sortOrder:'asc'},{createdAt:'asc'},{id:'asc'}]});
 return {buyerOrgId,sellerOrgId,seller:party(seller),buyer:party(buyer),sellerBankAccounts:accounts};
}
export function normalizeGeneralInvoiceLines(lines:any){
 if(!Array.isArray(lines)||!lines.length||lines.length>50)return invalid();
 const seen=new Set<string>();
 return lines.map((row:any)=>{
  if(!row||typeof row!=='object'||typeof row.key!=='string'||!/^[-\w]{8,100}$/.test(row.key)||seen.has(row.key)||!Number.isSafeInteger(row.transactionCodeId)||row.transactionCodeId<=0)return invalid();
  seen.add(row.key);
  const input:any={key:row.key,transactionCodeId:row.transactionCodeId};
  if(row.currencyCode!==undefined){if(!['USD','VND','KRW'].includes(row.currencyCode))return invalid();input.currencyCode=row.currencyCode;}
  for(const key of ['unitId','materialVariantRevision'])if(row[key]!=null){if(!Number.isSafeInteger(row[key])||row[key]<=0)return invalid();input[key]=row[key];}
  for(const key of ['materialItemId','materialVariantId'])if(row[key]!=null){if(typeof row[key]!=='string'||!row[key]||row[key].length>100)return invalid();input[key]=row[key];}
  for(const [key,max] of [['description',1000],['unit',100],['remark',1000],['quantity',32],['unitPrice',32],['vatRate',8]] as const){
   const value=row[key]??'';if(typeof value!=='string'||value.length>max)return invalid();input[key]=value.trim();
  }
  return input;
 });
}
export async function validateGeneralInvoiceCodes(db:any,orgId:number,lines:any[]){
 const codes=new Map<number,any>();
 for(const id of new Set<number>(lines.map(row=>row.transactionCodeId)))codes.set(id,await companyBillableCode(db,orgId,id,{allowAnyDirection:true}));
 for(const line of lines){
  const code=codes.get(line.transactionCodeId);
  if(line.materialItemId||line.materialVariantId||code.base?.materialSettings?.enabled){
   const selected:any=await prepareMaterialSelection(db,orgId,code,{...line,materialVariantRequired:true});
   if(line.unitId!=null&&line.unitId!==selected.materialItemSnapshot?.unitId)return invalid('INVALID_MATERIAL_ITEM');
   line.materialItemId=selected.materialItemId;line.materialItemSnapshot=selected.materialItemSnapshot;line.unitId=selected.materialItemSnapshot.unitId;
  }
  if(line.unitId!=null){const unit=await db.expenseUnit.findFirst({where:{id:line.unitId,isActive:true}});if(!unit)return invalid();line.unit=unit.nameEn||unit.nameKo||unit.nameVi;}
 }
 return codes;
}
export function calculateGeneralInvoice(content:any,codes:Map<number,any>){
 if(!['VND','USD','KRW'].includes(content.currency)||!cashScheduleDate(content.fields?.date))return invalid();
 const inputs=normalizeGeneralInvoiceLines(content.lines);
 const lines=inputs.map((input:any)=>{
  const code=codes.get(input.transactionCodeId);
  if(!code||!input.description)return invalid();
  const currencyCode=input.currencyCode||content.currency;
  const amounts=calculateRequestAmounts(input.unitPrice,input.quantity,currencyCode,input.vatRate);
  if(!code.vatEnabled&&!amounts.vatRate.isZero())return invalid('VAT_NOT_ENABLED');
  const original=content.lines.find((row:any)=>row.key===input.key);
  return {currencyCode,lineKey:input.key,transactionCodeId:code.id,code:code.code,codeDescription:code.nameEn||code.nameKo||'',description:input.description,unit:input.unit,remark:input.remark,...(input.unitId?{unitId:input.unitId}:{}),...(original?.materialItemId?{materialItemId:original.materialItemId,materialItemSnapshot:original.materialItemSnapshot}:{}),
   quantity:amounts.quantity.toString(),unitPrice:amounts.unitPrice.toString(),vatRate:amounts.vatRate.toString(),subtotal:amounts.subtotal.toString(),vatAmount:amounts.vatAmount.toString(),amount:amounts.amount.toString()};
 });
 const currencyTotals=totalGeneralInvoiceCurrencies(lines),mixed=currencyTotals.length>1,currencyCode=mixed?'MIX':currencyTotals[0]!.currencyCode;
 const {subtotal,vatAmount,total}=mixed?{subtotal:'0',vatAmount:'0',total:'0'}:currencyTotals[0]!;
 return {documentKind:'GENERAL',pricingBasis:null,currencyCode,subtotal,vatAmount,total,receivableAdded:total,orders:[],lines,snapshot:{version:5,currencyTotals,templateVersion:'BARO_INVOICE_V1',documentKind:'GENERAL',pricingBasis:null,currencyCode,fields:structuredClone(content.fields),orders:[],lines,subtotal,vatAmount,total,receivableAdded:total,rendering:{format:'HTML_PRINT',originalPdfStored:false}}};
}

export async function issueGeneralInvoice(tx:any,sellerOrgId:number,actor:string,draft:any,issueKey:string){
 const content=structuredClone(draft.content);
 if(content.orders?.length||draft.orders?.length||draft.lines?.length)return invalid();
 await generalInvoiceSource(tx,sellerOrgId,draft.buyerOrgId);
 let original:any=null;
 const revisionReason=String(draft.revisionReason||'').trim();
 if(draft.revisionOfInvoiceId){
  await tx.$queryRawUnsafe('SELECT id FROM "Invoice" WHERE id=$1 AND "sellerOrgId"=$2 FOR UPDATE',draft.revisionOfInvoiceId,sellerOrgId);
  original=await tx.invoice.findFirst({where:{id:draft.revisionOfInvoiceId,sellerOrgId}});
  if(!original||original.documentKind!=='GENERAL'||original.status!=='ISSUED'||original.buyerOrgId!==draft.buyerOrgId||(original.currencyCode!=='MIX'&&original.currencyCode!==content.currency)||!revisionReason)throw createHttpError(409,'INVOICE_REVISION_SCOPE_CHANGED');
  if(await tx.invoiceCredit.count({where:{invoiceId:original.id,voidedAt:null}}))throw createHttpError(409,'INVOICE_CREDIT_VOID_BEFORE_REVISION');
 }
 await resolveInvoicePaymentAccount(tx,sellerOrgId,content.fields);
 const calculated=calculateGeneralInvoice(content,await validateGeneralInvoiceCodes(tx,sellerOrgId,content.lines));
 if(original&&JSON.stringify(invoiceCurrencyTotals(original).map(row=>row.currencyCode).sort())!==JSON.stringify(calculated.snapshot.currencyTotals.map(row=>row.currencyCode).sort()))throw createHttpError(409,'INVOICE_REVISION_SCOPE_CHANGED');
 const invoiceNumber=await allocateDocumentNumber(tx,sellerOrgId,'INV',content.fields.date,normalizeDocumentNumber(content.fields.number));
 calculated.snapshot.fields={...calculated.snapshot.fields,number:invoiceNumber};
 const latest=await tx.invoice.findFirst({where:{sellerOrgId},orderBy:{sequenceNumber:'desc'},select:{sequenceNumber:true}});
 const invoice=await tx.invoice.create({data:{...invoiceBankLinks(content.fields),sellerOrgId,buyerOrgId:draft.buyerOrgId,documentKind:'GENERAL',pricingBasis:null,clientKey:issueKey,invoiceNumber,sequenceNumber:(latest?.sequenceNumber||0)+1,currencyCode:calculated.currencyCode,subtotal:calculated.subtotal,total:calculated.total,receivableAdded:calculated.total,snapshot:calculated.snapshot,issuedBy:actor,revisionOfInvoiceId:original?.id??null,rootInvoiceId:original?(original.rootInvoiceId||original.id):null,revisionNumber:original?original.revisionNumber+1:1,revisionReason}});
 await tx.invoiceGeneralLine.createMany({data:calculated.lines.map(line=>({...line,sellerOrgId,invoiceId:invoice.id}))});
 if(original){const updated=await tx.invoice.updateMany({where:{id:original.id,sellerOrgId,status:'ISSUED'},data:{status:'SUPERSEDED'}});if(updated.count!==1)throw createHttpError(409,'STALE_EDIT');}
 return invoice;
}
