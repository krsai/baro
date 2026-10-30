import {Prisma} from '@prisma/client';
import {accountingInputs,accountingInputTarget} from './accountingInputs';
import {createHttpError} from '../utils/http';

export const LINK_TARGETS = ['NONE','ORDER','STYLE','PROCESS'] as const;
export function applyExpenseCodeLinkPolicy(code: any, target: string = 'NONE', auditId: number | null = null, preservedProcess = false, production?: boolean, inputSettings?:any) {
  if (!code) return code;
  const process = target === 'PROCESS';
  // Required input is independent of the existing production-record workflow.
  const recordsProduction=production ?? (process && code.base?.entryMode==='PROCESS');
  return {...code,linkReferenceVersion:2,linkTarget:target,linkPolicyAuditId:auditId,base:{...code.base,
    entryMode:recordsProduction?'PROCESS':'GENERAL',orderInput:target!=='NONE'?'REQUIRED':'OPTIONAL',
    styleInput:target==='ORDER'?'HIDDEN':process||target==='STYLE'?'REQUIRED':'OPTIONAL',processInput:process?'REQUIRED':target==='STYLE'||preservedProcess?'OPTIONAL':'HIDDEN',...(inputSettings||{})}};
}

export async function resolveExpenseCodeLink(tx: any, orgId: number, code: any, edit?: any) {
  if (edit?.cost || edit?.record) {
    // Old rows have no snapshot. Their actual production FK is authoritative.
    const target=edit.record?'PROCESS':edit.cost.linkTarget ?? 'NONE';
    const snapshot=edit.cost?.linkPolicyAuditId?await tx.expenseCodeLinkAudit?.findUnique?.({where:{id:edit.cost.linkPolicyAuditId}}):null;
    return applyExpenseCodeLinkPolicy(code,target,edit.cost?.linkPolicyAuditId ?? null,Boolean(edit.cost?.styleProcessId),Boolean(edit.record),snapshot?.inputSettings);
  }
  if (!code?.baseId) return code;
  const policy=await tx.expenseCodeLinkPolicy.findUnique({where:{orgId_baseId:{orgId,baseId:code.baseId}}});
  const result=effectiveExpenseCode(code,policy);
  if(!policy?.inputSettings && tx.expenseCodeLinkAudit?.create){
   const audit=await tx.expenseCodeLinkAudit.create({data:{orgId,baseId:code.baseId,target:result.linkTarget,source:policy?'COMPANY_SNAPSHOT':'SYSTEM_DEFAULT',inputSettings:accountingInputs(result.base)}});
   result.linkPolicyAuditId=audit.id;
  }
  return result;
}

export function effectiveExpenseCode(code:any,policy?:any){
 if(!code)return code;
 const settings=policy?.inputSettings??(!policy?accountingInputs(code.base):undefined);
 return applyExpenseCodeLinkPolicy(code,policy?.target??accountingInputTarget(settings),policy?.auditId??null,false,undefined,settings);
}

export async function saveExpenseCodeLinkPolicy(tx: any, orgId: number, actorId: number, baseId: number, target: string, inputSettings?:any) {
  const settings=inputSettings===undefined?undefined:accountingInputs(inputSettings);
  if(settings)target=accountingInputTarget(settings);
  if (!Number.isSafeInteger(baseId)||baseId<=0||!LINK_TARGETS.includes(target as any)||!Number.isSafeInteger(actorId)||actorId<=0)
    throw createHttpError(400,'INVALID_EXPENSE_CODE_LINK_POLICY');
  // Serialize absent-row creation too; an upsert alone cannot lock an absent policy.
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
  if (!await tx.transactionCodeBase.findFirst({where:{id:baseId,isActive:true,expenseType:{isActive:true}}}))throw createHttpError(400,'INVALID_EXPENSE_CODE_BASE');
  const current=await tx.expenseCodeLinkPolicy.findUnique({where:{orgId_baseId:{orgId,baseId}}});
  if(current?.target===target&&JSON.stringify(current.inputSettings?accountingInputs(current.inputSettings):null)===JSON.stringify(settings??null))return current;
  const audit=await tx.expenseCodeLinkAudit.create({data:{orgId,baseId,previousTarget:current?.target ?? 'NONE',target,actorId,...(settings?{inputSettings:settings}:{})}});
  return tx.expenseCodeLinkPolicy.upsert({where:{orgId_baseId:{orgId,baseId}},
    create:{orgId,baseId,target,auditId:audit.id,...(settings?{inputSettings:settings}:{})},update:{target,auditId:audit.id,...(settings?{inputSettings:settings}:current?.inputSettings?{inputSettings:Prisma.DbNull}:{})}});
}

export function registerExpenseCodeLinkPolicyRoutes(app: any, db: any, gates: any) {
  const path='/app-settings/expense-code-links';
  app.get(path,async(req: any,res: any)=>{
    const access=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT']});if(!access)return;
    const [bases,policies]=await Promise.all([
      db.transactionCodeBase.findMany({where:{isActive:true,expenseType:{isActive:true}},orderBy:{code:'asc'}}),
      db.expenseCodeLinkPolicy.findMany({where:{orgId:access.organization.id}}),
    ]);
    const byId=new Map(policies.map((row: any)=>[row.baseId,row]));
    res.json(bases.map((base: any)=>({id:base.id,code:base.code,nameKo:base.nameKo,nameEn:base.nameEn,nameVi:base.nameVi,
      inputSettings:accountingInputs(effectiveExpenseCode({...base,base},byId.get(base.id)).base),
      target:(byId.get(base.id) as any)?.target ?? accountingInputTarget(accountingInputs(base)),updatedAt:(byId.get(base.id) as any)?.updatedAt ?? null})));
  });
  app.put(path,async(req: any,res: any)=>{
    const access=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN']});if(!access)return;
    const {baseId,target,inputSettings}=req.body ?? {};
    res.json(await db.$transaction((tx: any)=>saveExpenseCodeLinkPolicy(tx,access.organization.id,gates.actorId(),baseId,target,inputSettings),{isolationLevel:'Serializable'}));
  });
}
