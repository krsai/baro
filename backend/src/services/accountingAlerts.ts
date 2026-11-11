import {createHash} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {attachPartnerClassifications} from './partnerClassification';
import {companyIndustryMenuFeatures} from './industryMenuPolicy';
const hash=(value:any)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const prefix=(orgId:number)=>`ACCOUNTING_ALERT_ACK:${orgId}:`;
const codeInclude={base:{include:{industryLinks:{include:{industry:true}},serviceType:true,expenseType:true}},serviceType:{include:{systemDefault:true}}};
export function accountingAlertKinds(source:any,partner:any){
 const code=source.code,base=code?.base;if(!code||!base)return [];
 const kinds=[];if(['IN','OUT'].includes(base.cashDirection)&&base.cashDirection!==source.direction)kinds.push('DIRECTION');
 const links=base.industryLinks||[],allowed=links.length?links.map((link:any)=>link.systemIndustryId):base.serviceTypeId?[base.serviceTypeId]:[];
 const funds=[base.serviceType,base.expenseType,code.serviceType?.systemDefault,...links.map((link:any)=>link.industry)].some(row=>row?.code==='FUNDS');
 const classification=partner?.linkedCompany?.subscriberOrgId?partner.officialClassification:partner?.classification;
 const actual=classification?.industryIds||[];
 if(partner&&!funds&&allowed.length&&actual.length&&!allowed.some((id:number)=>actual.includes(id)))kinds.push('PARTNER_INDUSTRY');
 return kinds;
}
export async function accountingAlertCandidates(db:any,orgId:number,permissions:any){
 const [ledger,costs,invoices]=await Promise.all([
  permissions.ledger?db.bankLedgerEntry.findMany({where:{orgId,voidedAt:null},select:{id:true,transactionDate:true,direction:true,counterpartyOrgId:true,counterpartyName:true,accountingCode:{include:codeInclude},amount:true,purpose:true,settlementLines:{select:{id:true,amount:true,purpose:true,accountingCode:{include:codeInclude}}}}}):[],
  permissions.expense?db.partnerTransactionCost.findMany({where:{orgId,transactionCodeId:{not:null},OR:[{expenseRequestId:null},{expenseRequest:{deletedAt:null}}]},select:{id:true,partnerOrgId:true,transactionDate:true,amount:true,description:true,expenseRequestId:true,expenseRequest:{select:{version:true,managementNumber:true}},transactionCode:{include:codeInclude}}}):[],
  permissions.invoice?db.invoiceGeneralLine.findMany({where:{sellerOrgId:orgId,invoice:{status:'ISSUED'}},select:{id:true,amount:true,description:true,transactionCode:{include:codeInclude},invoice:{select:{id:true,buyerOrgId:true,issuedAt:true,invoiceNumber:true}}}}):[],
 ]);
 const ids=[...new Set<number>([...ledger.map((row:any)=>row.counterpartyOrgId),...costs.map((row:any)=>row.partnerOrgId),...invoices.map((row:any)=>row.invoice.buyerOrgId)].filter(Boolean))];
 const parties=ids.length?await attachPartnerClassifications(db,orgId,(await db.organization.findMany({where:{id:{in:ids}},select:{id:true,name:true}})).map((row:any)=>({...row,entityId:row.id}))):[];
 const sources=[...ledger.flatMap((row:any)=>[{sourceKind:'LEDGER',sourceId:row.id,date:row.transactionDate,direction:row.direction,code:row.accountingCode,partyId:row.counterpartyOrgId,partyName:row.counterpartyName,revision:[String(row.amount),row.purpose],path:'/bank-ledger/edit/'+row.id},...row.settlementLines.map((line:any)=>({sourceKind:'SETTLEMENT',sourceId:line.id,date:row.transactionDate,direction:'OUT',code:line.accountingCode,partyId:row.counterpartyOrgId,partyName:row.counterpartyName,revision:[String(line.amount),line.purpose],path:'/bank-ledger/edit/'+row.id}))]),...costs.map((row:any)=>({sourceKind:'EXPENSE',sourceId:row.id,date:row.transactionDate,direction:'OUT',code:row.transactionCode,partyId:row.partnerOrgId,revision:[row.expenseRequest?.version,String(row.amount),row.description],reference:row.expenseRequest?.managementNumber||'',path:'/outsourcing-record/edit/'+(row.expenseRequestId?'request/'+row.expenseRequestId:'cost/'+row.id)})),...invoices.map((row:any)=>({sourceKind:'INVOICE',sourceId:row.id,date:new Date(row.invoice.issuedAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}),direction:'IN',code:row.transactionCode,partyId:row.invoice.buyerOrgId,revision:[String(row.amount),row.description],reference:row.invoice.invoiceNumber,path:'/invoices/'+row.invoice.id}))];
 return sources.flatMap(source=>{const party=parties.find((row:any)=>row.id===source.partyId);return accountingAlertKinds(source,party).map(kind=>{
  const classification=party?.linkedCompany?.subscriberOrgId?party.officialClassification:party?.classification;
  const signature=hash([orgId,kind,source.sourceKind,source.sourceId,source.date,source.revision,source.direction,source.code.id,source.code.base.cashDirection,source.code.base.industryRevision,source.code.base.serviceTypeId,[...(source.code.base.industryLinks||[])].map((link:any)=>link.systemIndustryId).sort((a:number,b:number)=>a-b),source.partyId,classification?.revision,[...(classification?.industryIds||[])].sort((a:number,b:number)=>a-b)]);
  return {signature,kind,sourceKind:source.sourceKind,sourceId:source.sourceId,date:source.date,path:source.path,reference:source.reference||'',code:source.code.code,description:source.code.base.nameEn||source.code.nameEn||'',partyName:party?.name||source.partyName||'',expectedDirection:source.code.base.cashDirection,actualDirection:source.direction};
 });}).sort((a:any,b:any)=>b.date.localeCompare(a.date)||a.signature.localeCompare(b.signature));
}
export async function listAccountingAlerts(db:any,orgId:number,permissions:any,query:any={}){
 const page=Number(query.page||0);if(!Number.isSafeInteger(page)||page<0||page>10000)throw createHttpError(400,'ACCOUNTING_ALERT_INVALID');
 const kinds=String(query.kinds||'DIRECTION,PARTNER_INDUSTRY').split(',');if(kinds.some(kind=>!['DIRECTION','PARTNER_INDUSTRY'].includes(kind)))throw createHttpError(400,'ACCOUNTING_ALERT_INVALID');
 const candidates=await accountingAlertCandidates(db,orgId,permissions),receipts=await db.systemSetting.findMany({where:{key:{startsWith:prefix(orgId)}},select:{key:true}}),acknowledged=new Set(receipts.map((row:any)=>row.key));
 const rows=candidates.filter((row:any)=>kinds.includes(row.kind)&&!acknowledged.has(prefix(orgId)+row.signature));return {rows:rows.slice(page*10,page*10+10),total:rows.length,page};
}
export async function acknowledgeAccountingAlert(db:any,orgId:number,actorId:number,permissions:any,signature:unknown){
 if(typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))throw createHttpError(400,'ACCOUNTING_ALERT_INVALID');
 return retryEditTransaction(db,async(tx:any)=>{
  const actor=await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE'},select:{id:true}});if(!actor)throw createHttpError(403,'ACCOUNTING_ALERT_ACCESS_DENIED');
  if(!(await accountingAlertCandidates(tx,orgId,permissions)).some((row:any)=>row.signature===signature))throw createHttpError(409,'ACCOUNTING_ALERT_CHANGED');
  await tx.systemSetting.upsert({where:{key:prefix(orgId)+signature},create:{key:prefix(orgId)+signature,value:{signature,orgId,actorId,acknowledgedAt:new Date().toISOString()},updatedByEmployeeId:actorId},update:{}});return {acknowledged:true};
 });
}
export function registerAccountingAlertRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any)=>{
  const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','ACCOUNTANT','OPERATOR'],allowSystemAdmin:false});if(!ctx)return;
  const orgId=ctx.organization.id,actorId=gates.actorId(),actor=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE'},select:{orgRole:true}});if(!actor)throw createHttpError(403,'ACCOUNTING_ALERT_ACCESS_DENIED');
  const features=await companyIndustryMenuFeatures(db,orgId,ctx.organization.type),allowed=async(feature:string)=>features.includes(feature)&&await gates.canAccess({orgType:ctx.organization.type,orgRole:actor.orgRole,feature});
  if(!await allowed('DASHBOARD'))throw createHttpError(403,'ACCOUNTING_ALERT_ACCESS_DENIED');
  const permissions={ledger:await allowed('BANK_LEDGER'),expense:await allowed('OUTSOURCING_RECORD'),invoice:await allowed('INVOICE')};if(!permissions.ledger&&!permissions.expense&&!permissions.invoice)throw createHttpError(403,'ACCOUNTING_ALERT_ACCESS_DENIED');
  res.setHeader('Cache-Control','no-store');return {orgId,actorId,permissions};
 };
 app.get('/dashboard/accounting-alerts',async(req:any,res:any)=>{const ctx=await access(req,res);if(ctx)res.json(await listAccountingAlerts(db,ctx.orgId,ctx.permissions,req.query));});
 app.post('/dashboard/accounting-alerts/acknowledge',async(req:any,res:any)=>{const ctx=await access(req,res);if(ctx)res.json(await acknowledgeAccountingAlert(db,ctx.orgId,ctx.actorId,ctx.permissions,req.body?.signature));});
}
