import {invoicePrimaryAccountText} from './invoicePrimaryAccounts';
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
const party=(row:any)=>({code:row?.code||'',name:row?.name||'',address:row?.address||'',country:row?.country||'',taxId:row?.businessNumber||'',email:row?.email||'',phone:row?.phone||''});
export async function generalInvoiceSource(db:any,sellerOrgId:number,buyerOrgId:number){
 if(!Number.isSafeInteger(buyerOrgId)||buyerOrgId<=0)return invalid();
 const [seller,localBuyer]=await Promise.all([
  db.organization.findFirst({where:{id:sellerOrgId,isActive:true},select:publicCompanyFields}),
  db.organization.findFirst({where:{AND:[generalInvoiceBuyerScope(sellerOrgId),{id:buyerOrgId}]},select:publicCompanyFields}),
 ]);
 if(!seller||!localBuyer)return invalid('GENERAL_INVOICE_BUYER_INVALID');
 const [buyer]=await attachLinkedCompanies(db,sellerOrgId,[{...localBuyer,entityId:localBuyer.id}]);
 const accounts=await db.organizationBankAccount.findMany({where:{orgId:sellerOrgId,entityId:sellerOrgId,accountKind:'BANK'},select:{id:true,isDefault:true,isActive:true,bankName:true,accountNumber:true,accountHolder:true,currency:{select:{code:true}}},orderBy:[{sortOrder:'asc'},{createdAt:'asc'},{id:'asc'}]});
 return {buyerOrgId,sellerOrgId,seller:party(seller),buyer:party(buyer),sellerBankAccounts:accounts};
}
export function normalizeGeneralInvoiceLines(lines:any){
 if(!Array.isArray(lines)||!lines.length||lines.length>50)return invalid();
 const seen=new Set<string>();
 return lines.map((row:any)=>{
  if(!row||typeof row!=='object'||typeof row.key!=='string'||!/^[-\w]{8,100}$/.test(row.key)||seen.has(row.key)||!Number.isSafeInteger(row.transactionCodeId)||row.transactionCodeId<=0)return invalid();
  seen.add(row.key);
  const input:any={key:row.key,transactionCodeId:row.transactionCodeId};
  for(const [key,max] of [['description',1000],['unit',100],['remark',1000],['quantity',32],['unitPrice',32],['vatRate',8]] as const){
   const value=row[key]??'';if(typeof value!=='string'||value.length>max)return invalid();input[key]=value.trim();
  }
  return input;
 });
}
export async function validateGeneralInvoiceCodes(db:any,orgId:number,lines:any[]){
 const codes=new Map<number,any>();
 for(const id of new Set<number>(lines.map(row=>row.transactionCodeId)))codes.set(id,await companyBillableCode(db,orgId,id));
 return codes;
}
export function calculateGeneralInvoice(content:any,codes:Map<number,any>){
 if(!['VND','USD','KRW'].includes(content.currency)||!cashScheduleDate(content.fields?.date))return invalid();
 const inputs=normalizeGeneralInvoiceLines(content.lines);
 const lines=inputs.map((input:any)=>{
  const code=codes.get(input.transactionCodeId);
  if(!code||!['IN','BOTH'].includes(code.cashDirection)||!input.description)return invalid();
  const amounts=calculateRequestAmounts(input.unitPrice,input.quantity,content.currency,input.vatRate);
  if(!code.vatEnabled&&!amounts.vatRate.isZero())return invalid('VAT_NOT_ENABLED');
  return {lineKey:input.key,transactionCodeId:code.id,code:code.code,codeDescription:code.nameEn||code.nameKo||'',description:input.description,unit:input.unit,remark:input.remark,
   quantity:amounts.quantity.toString(),unitPrice:amounts.unitPrice.toString(),vatRate:amounts.vatRate.toString(),subtotal:amounts.subtotal.toString(),vatAmount:amounts.vatAmount.toString(),amount:amounts.amount.toString()};
 });
 const sum=(key:string)=>lines.reduce((total:any,line:any)=>total.add(line[key]),new Prisma.Decimal(0)).toString();
 const subtotal=sum('subtotal'),vatAmount=sum('vatAmount'),total=sum('amount');
 return {documentKind:'GENERAL',pricingBasis:null,currencyCode:content.currency,subtotal,vatAmount,total,receivableAdded:total,orders:[],lines,snapshot:{version:4,templateVersion:'BARO_INVOICE_V1',documentKind:'GENERAL',pricingBasis:null,currencyCode:content.currency,fields:structuredClone(content.fields),orders:[],lines,subtotal,vatAmount,total,receivableAdded:total,rendering:{format:'HTML_PRINT',originalPdfStored:false}}};
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
  if(!original||original.documentKind!=='GENERAL'||original.status!=='ISSUED'||original.buyerOrgId!==draft.buyerOrgId||original.currencyCode!==content.currency||!revisionReason)throw createHttpError(409,'INVOICE_REVISION_SCOPE_CHANGED');
  if(await tx.invoiceCredit.count({where:{invoiceId:original.id,voidedAt:null}}))throw createHttpError(409,'INVOICE_CREDIT_VOID_BEFORE_REVISION');
 }
 content.fields.bank=await invoicePrimaryAccountText(tx,sellerOrgId);
 const calculated=calculateGeneralInvoice(content,await validateGeneralInvoiceCodes(tx,sellerOrgId,content.lines));
 const invoiceNumber=await allocateDocumentNumber(tx,sellerOrgId,'INV',content.fields.date,normalizeDocumentNumber(content.fields.number));
 calculated.snapshot.fields={...calculated.snapshot.fields,number:invoiceNumber};
 const latest=await tx.invoice.findFirst({where:{sellerOrgId},orderBy:{sequenceNumber:'desc'},select:{sequenceNumber:true}});
 const invoice=await tx.invoice.create({data:{sellerOrgId,buyerOrgId:draft.buyerOrgId,documentKind:'GENERAL',pricingBasis:null,clientKey:issueKey,invoiceNumber,sequenceNumber:(latest?.sequenceNumber||0)+1,currencyCode:content.currency,subtotal:calculated.subtotal,total:calculated.total,receivableAdded:calculated.total,snapshot:calculated.snapshot,issuedBy:actor,revisionOfInvoiceId:original?.id??null,rootInvoiceId:original?(original.rootInvoiceId||original.id):null,revisionNumber:original?original.revisionNumber+1:1,revisionReason}});
 await tx.invoiceGeneralLine.createMany({data:calculated.lines.map(line=>({...line,sellerOrgId,invoiceId:invoice.id}))});
 if(original){const updated=await tx.invoice.updateMany({where:{id:original.id,sellerOrgId,status:'ISSUED'},data:{status:'SUPERSEDED'}});if(updated.count!==1)throw createHttpError(409,'STALE_EDIT');}
 return invoice;
}
