import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {readClassification,saveClassification} from './partnerClassification';
import {resolveAccountingCode,ACCOUNTING_CODE_INCLUDE} from './accountingCode';

const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
const include={...ACCOUNTING_CODE_INCLUDE,base:{include:{...ACCOUNTING_CODE_INCLUDE.base.include,industryLinks:true}}};
async function actor(db:any,orgId:number,actorId:number,write=false){const value=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:write?['ADMIN']:['ADMIN','OPERATOR','ACCOUNTANT']}}});if(!value)fail('COMPANY_INDUSTRY_ADMIN_REQUIRED',403);return value;}
export async function readCompanyIndustries(db:any,orgId:number,actorId:number){
 const user=await actor(db,orgId,actorId),classification=await readClassification(db,orgId,orgId);
 const codes=await db.transactionCode.findMany({where:{ownerOrgId:orgId},include,orderBy:{id:'asc'}});
 return {classification,canEdit:user.orgRole==='ADMIN',codes:codes.map((raw:any)=>{const code=resolveAccountingCode(raw);const available=!!code&&['IN','BOTH'].includes(code.cashDirection);return {...(code||raw),industryIds:raw.base?.industryLinks.map((l:any)=>l.systemIndustryId)||[],eligible:available,available};}).filter((c:any)=>c.eligible||c.canBill)};
}
export async function saveCompanyIndustries(db:any,orgId:number,actorId:number,input:any){
 await actor(db,orgId,actorId,true);const ids=input?.billingCodeIds;
 if(ids!==undefined&&(!Array.isArray(ids)||ids.length>1000||ids.some((id:number)=>!Number.isSafeInteger(id)||id<=0)||new Set(ids).size!==ids.length))fail('COMPANY_BILLING_CODE_INVALID');
 return retryEditTransaction(db,async(tx:any)=>{
  await actor(tx,orgId,actorId,true);
  await saveClassification(tx,orgId,orgId,actorId,input.classification);
  // Older clients may still send their saved whitelist. New company profiles
  // only save industries; omitting this field must preserve legacy metadata.
  if(ids!==undefined){
  const current=await readCompanyIndustries(tx,orgId,actorId);
  if(ids.some((id:number)=>!current.codes.some((c:any)=>c.id===id&&c.available)))fail('COMPANY_BILLING_CODE_INVALID');
  await tx.transactionCode.updateMany({where:{ownerOrgId:orgId,canBill:true,id:{notIn:ids}},data:{canBill:false}});
  if(ids.length)await tx.transactionCode.updateMany({where:{ownerOrgId:orgId,id:{in:ids}},data:{canBill:true}});
  }
  return readCompanyIndustries(tx,orgId,actorId);
 });
}
// Billing accepts any active company code with a compatible cash direction.
// Industry classification and the legacy canBill flag do not restrict it.
export async function companyBillableCode(db:any,orgId:number,id:number){
 const raw=await db.transactionCode.findFirst({where:{id,ownerOrgId:orgId},include}),code=raw&&resolveAccountingCode(raw);
 if(!code||!['IN','BOTH'].includes(code.cashDirection))fail('COMPANY_BILLING_CODE_INVALID');
 return code;
}
export function registerCompanyIndustryRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any)=>{const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT'],allowSystemAdmin:false});if(!ctx)return null;const actorId=gates.actorId();if(!actorId)fail('COMPANY_INDUSTRY_ADMIN_REQUIRED',403);return {orgId:ctx.organization.id,actorId};};
 app.get('/company-industries',async(req:any,res:any)=>{const s=await access(req,res);if(s)res.json(await readCompanyIndustries(db,s.orgId,s.actorId));});
 app.put('/company-industries',async(req:any,res:any)=>{const s=await access(req,res);if(s)res.json(await saveCompanyIndustries(db,s.orgId,s.actorId,req.body));});
 app.get('/company-billing-codes',async(req:any,res:any)=>{const s=await access(req,res);if(s)res.json((await readCompanyIndustries(db,s.orgId,s.actorId)).codes.filter((c:any)=>c.available));});
}
