import {accountingDashboardRole} from './dashboardAccess';
import {readDashboardRecipients,receivesAccountingAlert} from './dashboardAlertRecipients';
import {createHash} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {attachPartnerClassifications} from './partnerClassification';
import {companyIndustryMenuFeatures} from './industryMenuPolicy';
import {shippingGeneralCustomerId} from './shippingGeneralCustomer';
const hash=(value:any)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const prefix=(orgId:number,actorId:number)=>`ACCOUNTING_ALERT_ACK_USER:${orgId}:${actorId}:`;
const industryInclude={partnerRole:true,expenseType:true};
const codeInclude={base:{include:{industryLinks:{include:{industry:{include:industryInclude}}},serviceType:{include:industryInclude},expenseType:true}},serviceType:{include:{systemDefault:{include:industryInclude}}}};
const financialIndustry=(industry:any)=>industry?.code==='FUNDS'||industry?.expenseType?.code==='FUNDS'||['FINANCE','FUNDS'].includes(industry?.partnerRole?.code);
export function isFinancialAccountingCode(code:any){
 const sources=[code?.serviceType,code?.serviceType?.systemDefault,code?.base?.serviceType,code?.base?.expenseType,...(code?.industries||[]),...(code?.base?.industries||[]),...(code?.base?.industryLinks||[]).map((link:any)=>link.industry)];
 return sources.some(financialIndustry);
}
export function handledItemAnomaly(base:any,shared:number[],policy:any){
 if(!shared.length)return null;
 let stale=false;
 for(const id of shared){
  const industry=base.industryLinks?.find((link:any)=>link.systemIndustryId===id)?.industry??(base.serviceTypeId===id?base.serviceType:null);
  if(!industry?.handledItemSelection)return null;
  const choices=(policy?.selections||[]).filter((row:any)=>row.industryId===id);
  if(!choices.length)return null;
  const valid=(choice:any)=>choice.base?.isActive!==false&&choice.base?.industryLinks?.some((link:any)=>link.systemIndustryId===id);
  if(choices.some((choice:any)=>choice.baseId===base.id&&valid(choice)))return null;
  if(choices.some((choice:any)=>!valid(choice)))stale=true;
 }
 return stale?'PARTNER_HANDLED_SETTINGS':'PARTNER_HANDLED_ITEM';
}
export function accountingAlertKinds(source:any,partner:any,generalCustomerId:number|null=null){
 const code=source.code,base=code?.base;if(!code||!base)return source.sourceKind==='LEDGER'&&source.accountingCodeId==null&&!source.hasLinkedCodes?['UNCODED_LEDGER']:[];
 const kinds=[];if(source.employee?.status==='TERMINATED'&&source.direction==='OUT'&&(!source.employee.leftAt||source.date>new Date(source.employee.leftAt).toISOString().slice(0,10)))kinds.push('RETIRED_EMPLOYEE');if(['IN','OUT'].includes(base.cashDirection)&&base.cashDirection!==source.direction)kinds.push('DIRECTION');
 const links=base.industryLinks||[],allowed=links.length?links.map((link:any)=>link.systemIndustryId):base.serviceTypeId?[base.serviceTypeId]:[];
 const classification=partner?.linkedCompany&&partner.officialClassification?.industryIds?.length?partner.officialClassification:partner?.classification;
 const actual=classification?.industryIds||[];
 const generalExpress=generalCustomerId!=null&&source.partyId===generalCustomerId&&base.code==='EXP';
 const financial=isFinancialAccountingCode(code);
 if(!financial&&!generalExpress&&partner&&allowed.length&&actual.length&&!allowed.some((id:number)=>actual.includes(id)))kinds.push('PARTNER_INDUSTRY');
 if(!financial&&!generalExpress&&partner){const handled=handledItemAnomaly(base,allowed.filter((id:number)=>actual.includes(id)),source.handledPolicy);if(handled)kinds.push(handled);}
 return kinds;
}
export async function accountingAlertCandidates(db:any,orgId:number,permissions:any){
 const [ledger,costs,invoices,pending]=await Promise.all([
  permissions.ledger?db.bankLedgerEntry.findMany({where:{orgId,voidedAt:null},select:{id:true,transactionDate:true,direction:true,accountingCodeId:true,account:{select:{currencyCode:true}},counterpartyOrgId:true,counterpartyName:true,allocations:{select:{expenseItemId:true}},counterpartyEmployee:{select:{status:true,leftAt:true}},accountingCode:{include:codeInclude},amount:true,purpose:true,settlementLines:{select:{id:true,amount:true,purpose:true,accountingCode:{include:codeInclude}}}}}):[],
  permissions.expense?db.partnerTransactionCost.findMany({where:{orgId,transactionCodeId:{not:null},OR:[{expenseRequestId:null},{expenseRequest:{deletedAt:null}}]},select:{id:true,partnerOrgId:true,transactionDate:true,amount:true,description:true,expenseRequestId:true,expenseRequest:{select:{version:true,managementNumber:true}},transactionCode:{include:codeInclude}}}):[],
  permissions.invoice?db.invoiceGeneralLine.findMany({where:{sellerOrgId:orgId,invoice:{status:'ISSUED'}},select:{id:true,amount:true,description:true,transactionCode:{include:codeInclude},invoice:{select:{id:true,buyerOrgId:true,issuedAt:true,invoiceNumber:true}}}}):[],
  db.changeApprovalRequest.findMany({where:{orgId,status:'PENDING'},select:{operation:true,ledgerEntryId:true,expenseRequestId:true,legacyCostId:true,invoiceId:true}}),
 ]);
 // Multi-item payments need not have a single representative code.
 const expenseIds=[...new Set<string>(ledger.flatMap((row:any)=>(row.allocations||[]).map((allocation:any)=>allocation.expenseItemId).filter(Boolean)))];
 const linkedExpenses=expenseIds.length?await db.partnerTransactionCost.findMany({where:{orgId,id:{in:expenseIds}},select:{id:true,transactionCodeId:true}}):[];
 const codedExpenseIds=new Set(linkedExpenses.filter((row:any)=>row.transactionCodeId!=null).map((row:any)=>row.id));
 const hasLinkedCodes=(row:any)=>{
  const allocations=row.allocations||[],lines=row.settlementLines||[];
  return allocations.length>0&&allocations.every((allocation:any)=>codedExpenseIds.has(allocation.expenseItemId))||lines.length>0&&lines.every((line:any)=>line.accountingCode?.id!=null);
 };
 const ids=[...new Set<number>([...ledger.map((row:any)=>row.counterpartyOrgId),...costs.map((row:any)=>row.partnerOrgId),...invoices.map((row:any)=>row.invoice.buyerOrgId)].filter(Boolean))];
 const generalCustomerId=ids.length?await shippingGeneralCustomerId(db,orgId):null;
 const parties=ids.length?await attachPartnerClassifications(db,orgId,(await db.organization.findMany({where:{id:{in:ids}},select:{id:true,name:true}})).map((row:any)=>({...row,entityId:row.id}))):[];
 const handledPolicies=ids.length&&db.partnerHandledPolicy?await db.partnerHandledPolicy.findMany({where:{orgId,entityId:{in:ids}},include:{selections:{include:{base:{select:{id:true,isActive:true,industryLinks:{select:{systemIndustryId:true}}}}}}}}):[];
 const sources=[...ledger.flatMap((row:any)=>[{sourceKind:'LEDGER',sourceId:row.id,amount:String(row.amount),currencyCode:row.account?.currencyCode,description:row.purpose,employee:row.counterpartyEmployee,pendingOperation:pending.find((p:any)=>p.ledgerEntryId===row.id)?.operation,date:row.transactionDate,direction:row.direction,code:row.accountingCode,accountingCodeId:row.accountingCodeId,hasLinkedCodes:hasLinkedCodes(row),partyId:row.counterpartyOrgId,partyName:row.counterpartyName,revision:[String(row.amount),row.purpose],path:'/bank-ledger/edit/'+row.id},...row.settlementLines.map((line:any)=>({sourceKind:'SETTLEMENT',sourceId:line.id,pendingOperation:pending.find((p:any)=>p.ledgerEntryId===row.id)?.operation,date:row.transactionDate,direction:'OUT',code:line.accountingCode,partyId:row.counterpartyOrgId,partyName:row.counterpartyName,revision:[String(line.amount),line.purpose],path:'/bank-ledger/edit/'+row.id}))]),...costs.map((row:any)=>({sourceKind:'EXPENSE',sourceId:row.id,pendingOperation:pending.find((p:any)=>p.legacyCostId===row.id||row.expenseRequestId&&p.expenseRequestId===row.expenseRequestId)?.operation,date:row.transactionDate,direction:'OUT',code:row.transactionCode,partyId:row.partnerOrgId,revision:[row.expenseRequest?.version,String(row.amount),row.description],reference:row.expenseRequest?.managementNumber||'',path:'/outsourcing-record/edit/'+(row.expenseRequestId?'request/'+row.expenseRequestId:'cost/'+row.id)})),...invoices.map((row:any)=>({sourceKind:'INVOICE',sourceId:row.id,pendingOperation:pending.find((p:any)=>p.invoiceId===row.invoice.id)?.operation,date:new Date(row.invoice.issuedAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}),direction:'IN',code:row.transactionCode,partyId:row.invoice.buyerOrgId,revision:[String(row.amount),row.description],reference:row.invoice.invoiceNumber,path:'/invoices/'+row.invoice.id}))];
 return sources.flatMap(source=>{const party=parties.find((row:any)=>row.id===source.partyId),handledPolicy=handledPolicies.find((row:any)=>row.entityId===source.partyId);return accountingAlertKinds({...source,handledPolicy},party,generalCustomerId).map(kind=>{
  const classification=party?.linkedCompany&&party.officialClassification?.industryIds?.length?party.officialClassification:party?.classification;
  const signature=hash([orgId,kind,source.sourceKind,source.sourceId,source.date,source.revision,source.direction,source.code?.id,source.code?.base?.cashDirection,source.code?.base?.industryRevision,source.code?.base?.serviceTypeId,[...(source.code?.base?.industryLinks||[])].map((link:any)=>link.systemIndustryId).sort((a:number,b:number)=>a-b),source.partyId,classification?.revision,[...(classification?.industryIds||[])].sort((a:number,b:number)=>a-b),...(kind.startsWith('PARTNER_HANDLED')?[handledPolicy?.revision,handledPolicy?.selections.map((row:any)=>[row.industryId,row.baseId,row.base?.isActive,[...(row.base?.industryLinks||[])].map((link:any)=>link.systemIndustryId).sort((a:number,b:number)=>a-b)]).sort((a:any,b:any)=>a[0]-b[0]||a[1]-b[1]),source.code?.base?.industryLinks?.map((link:any)=>[link.systemIndustryId,link.industry?.handledItemSelection,link.industry?.handledItemRevision]).sort((a:any,b:any)=>a[0]-b[0])]:[]),...(kind==='RETIRED_EMPLOYEE'?[source.employee?.status,source.employee?.leftAt]:[])]);
  return {signature,kind,...(kind==='UNCODED_LEDGER'?{amount:source.amount,currencyCode:source.currencyCode}:{}),pendingOperation:source.pendingOperation||null,sourceKind:source.sourceKind,sourceId:source.sourceId,date:source.date,path:source.path,reference:source.reference||'',code:source.code?.code||'',description:source.code?.base?.nameEn||source.code?.nameEn||source.description||'',partyName:party?.name||source.partyName||'',expectedDirection:source.code?.base?.cashDirection,actualDirection:source.direction};
 });}).sort((a:any,b:any)=>b.date.localeCompare(a.date)||a.signature.localeCompare(b.signature));
}
export async function listAccountingAlerts(db:any,orgId:number,actorId:number,permissions:any,query:any={}){
 if(!Number.isSafeInteger(actorId)||actorId<=0)throw createHttpError(403,'ACCOUNTING_ALERT_ACCESS_DENIED');
 const actor=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT','OPERATOR']}},select:{id:true,orgRole:true}});
 const recipients=await readDashboardRecipients(db,orgId);
 if(!actor||!accountingDashboardRole(actor.orgRole)&&!recipients.handledRoles.includes(actor.orgRole)&&!recipients.uncodedRoles.includes(actor.orgRole))throw createHttpError(403,'ACCOUNTING_ALERT_ACCESS_DENIED');
 const page=Number(query.page||0);if(!Number.isSafeInteger(page)||page<0||page>10000)throw createHttpError(400,'ACCOUNTING_ALERT_INVALID');
 const kinds=String(query.kinds||'DIRECTION,PARTNER_INDUSTRY,PARTNER_HANDLED_ITEM,PARTNER_HANDLED_SETTINGS,RETIRED_EMPLOYEE,UNCODED_LEDGER').split(',');if(kinds.some(kind=>!['DIRECTION','PARTNER_INDUSTRY','PARTNER_HANDLED_ITEM','PARTNER_HANDLED_SETTINGS','RETIRED_EMPLOYEE','UNCODED_LEDGER'].includes(kind)))throw createHttpError(400,'ACCOUNTING_ALERT_INVALID');
 const candidates=await accountingAlertCandidates(db,orgId,permissions),legacyPrefix=`ACCOUNTING_ALERT_ACK:${orgId}:`;
 const receipts=await db.systemSetting.findMany({where:{OR:[{key:{startsWith:prefix(orgId,actorId)}},{key:{startsWith:legacyPrefix}}]},select:{key:true,value:true}});
 // Historical company receipts retain their original signer, never hide peers' alerts.
 const acknowledged=new Set(receipts.flatMap((row:any)=>row.key.startsWith(prefix(orgId,actorId))?[row.key.slice(prefix(orgId,actorId).length)]:row.value?.actorId===actorId&&row.value?.orgId===orgId?[row.key.slice(legacyPrefix.length)]:[]));
 const rows=candidates.filter((row:any)=>receivesAccountingAlert(row.kind,actor.orgRole,recipients)&&kinds.includes(row.kind)&&!acknowledged.has(row.signature));return {rows:rows.slice(page*10,page*10+10),total:rows.length,page};
}
export async function acknowledgeAccountingAlert(db:any,orgId:number,actorId:number,permissions:any,signature:unknown){
 if(!Number.isSafeInteger(actorId)||actorId<=0)throw createHttpError(403,'ACCOUNTING_ALERT_ACCESS_DENIED');
 if(typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))throw createHttpError(400,'ACCOUNTING_ALERT_INVALID');
 return retryEditTransaction(db,async(tx:any)=>{
  const actor=await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT','OPERATOR']}},select:{id:true,orgRole:true}});
  const recipients=await readDashboardRecipients(tx,orgId);
  if(!actor||!accountingDashboardRole(actor.orgRole)&&!recipients.handledRoles.includes(actor.orgRole)&&!recipients.uncodedRoles.includes(actor.orgRole))throw createHttpError(403,'ACCOUNTING_ALERT_ACCESS_DENIED');
  const current=(await accountingAlertCandidates(tx,orgId,permissions)).find((row:any)=>row.signature===signature);
  if(!current)throw createHttpError(409,'ACCOUNTING_ALERT_CHANGED');
  if(!receivesAccountingAlert(current.kind,actor.orgRole,recipients))throw createHttpError(403,'ACCOUNTING_ALERT_ACCESS_DENIED');
  if(current.pendingOperation)throw createHttpError(409,'ACCOUNTING_ALERT_PENDING');
  await tx.systemSetting.upsert({where:{key:prefix(orgId,actorId)+signature},create:{key:prefix(orgId,actorId)+signature,value:{signature,orgId,actorId,acknowledgedAt:new Date().toISOString()},updatedByEmployeeId:actorId},update:{}});return {acknowledged:true};
 });
}
export function registerAccountingAlertRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any,scopeOnly=false)=>{
  const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','ACCOUNTANT','OPERATOR'],allowSystemAdmin:false});if(!ctx)return;
  const orgId=ctx.organization.id,actorId=gates.actorId(),actor=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE'},select:{orgRole:true}});
  if(!Number.isSafeInteger(actorId)||actorId<=0)throw createHttpError(403,'ACCOUNTING_ALERT_ACCESS_DENIED');
  const recipients=await readDashboardRecipients(db,orgId);
  if(!actor||!['ADMIN','ACCOUNTANT','OPERATOR'].includes(actor.orgRole)||!scopeOnly&&!accountingDashboardRole(actor.orgRole)&&!recipients.handledRoles.includes(actor.orgRole)&&!recipients.uncodedRoles.includes(actor.orgRole))throw createHttpError(403,'ACCOUNTING_ALERT_ACCESS_DENIED');
  const features=await companyIndustryMenuFeatures(db,orgId,ctx.organization.type),allowed=async(feature:string)=>features.includes(feature)&&await gates.canAccess({orgType:ctx.organization.type,orgRole:actor.orgRole,feature});
  if(!await allowed('DASHBOARD'))throw createHttpError(403,'ACCOUNTING_ALERT_ACCESS_DENIED');
  const permissions={ledger:await allowed('BANK_LEDGER'),expense:await allowed('OUTSOURCING_RECORD'),invoice:await allowed('INVOICE')};if(!permissions.ledger&&!permissions.expense&&!permissions.invoice)throw createHttpError(403,'ACCOUNTING_ALERT_ACCESS_DENIED');
  res.setHeader('Cache-Control','no-store');return {orgId,actorId,permissions,handled:recipients.handledRoles.includes(actor.orgRole),uncoded:permissions.ledger&&recipients.uncodedRoles.includes(actor.orgRole)};
 };
 app.get('/dashboard/accounting-alert-scope',async(req:any,res:any)=>{const ctx=await access(req,res,true);if(ctx)res.json({handled:ctx.handled,uncoded:ctx.uncoded});});
 app.get('/dashboard/accounting-alerts',async(req:any,res:any)=>{const ctx=await access(req,res);if(ctx)res.json(await listAccountingAlerts(db,ctx.orgId,ctx.actorId,ctx.permissions,req.query));});
 app.post('/dashboard/accounting-alerts/acknowledge',async(req:any,res:any)=>{const ctx=await access(req,res);if(ctx)res.json(await acknowledgeAccountingAlert(db,ctx.orgId,ctx.actorId,ctx.permissions,req.body?.signature));});
}
