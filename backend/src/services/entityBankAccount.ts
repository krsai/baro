import { createHttpError } from '../utils/http';
import {retryEditTransaction,editRevision,assertEditRevision} from '../utils/editRevision';
import {LEDGER_ZERO_START} from './bankLedger';

export const BANK_INCLUDE = {currency:{select:{id:true,code:true,name:true}},ledgerAccounts:{select:{id:true,openingDate:true,openingBalance:true}}};
export async function requireEntityAccess(db:any,orgId:number,entityId:number) {
  if(!Number.isSafeInteger(entityId)||entityId<=0)throw createHttpError(400,'INVALID_ENTITY');
  const entity=await db.organization.findFirst({where:{id:entityId,OR:[{id:orgId},{ownerOrgId:orgId},{dataOwnerOrgId:orgId},
    {brandRelationships:{some:{manufacturerOrgId:orgId}}},{manufacturerRelationships:{some:{brandOrgId:orgId}}}]},select:{id:true}});
  if(!entity)throw createHttpError(404,'ENTITY_NOT_FOUND');
  return entity;
}
export async function requirePayeeBankAccount(tx:any,orgId:number,entityId:number|null,payeeEmployeeId?:number) {
  if(payeeEmployeeId){
    await tx.$queryRawUnsafe('SELECT id FROM "Employee" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',payeeEmployeeId,orgId);
    if(!await tx.employee.findFirst({where:{id:payeeEmployeeId,orgId,status:'ACTIVE'}})||!await tx.employeeExpenseBankAccount.findFirst({where:{orgId,employeeId:payeeEmployeeId}}))throw createHttpError(400,'PAYEE_BANK_ACCOUNT_REQUIRED');
    return;
  }
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',entityId);
  const account=await tx.organizationBankAccount.findFirst({where:{orgId,entityId},select:{id:true}});
  if(!account)throw createHttpError(400,'PAYEE_BANK_ACCOUNT_REQUIRED');
}
export async function saveEntityBankAccount(tx:any,orgId:number,actorId:number,entityId:number,id:string|null,body:any) {
  if(body.openingDate!==undefined||body.openingBalance!==undefined)throw createHttpError(409,'LEDGER_OPENING_LOCKED');
  await requireEntityAccess(tx,orgId,entityId);
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',entityId);
  const previous=id ? await tx.organizationBankAccount.findFirst({where:{id,orgId,entityId}}) : null;
  if(id&&!previous)throw createHttpError(404,'BANK_ACCOUNT_NOT_FOUND');
  const text=(key:string,max:number)=>{const value=typeof body?.[key]==='string'?body[key].trim():'';if(!value||value.length>max||/[\r\n]/.test(value))throw createHttpError(400,'INVALID_BANK_ACCOUNT');return value;};
  const currencyId=Number(body?.currencyId);
  if(!Number.isSafeInteger(currencyId)||currencyId<=0||!await tx.currency.findUnique({where:{id:currencyId}}))throw createHttpError(400,'INVALID_CURRENCY');
  const kind=body.accountKind??previous?.accountKind??'BANK';
  if(!['BANK','CASH'].includes(kind))throw createHttpError(400,'INVALID_BANK_ACCOUNT');
  const displayName=typeof body.displayName==='string'?body.displayName.trim():previous?.displayName||'';
  if(displayName.length>160||(kind==='CASH'&&!displayName))throw createHttpError(400,'INVALID_BANK_ACCOUNT');
  const linked=previous?await tx.bankLedgerAccount.findFirst({where:{orgId,entityAccountId:previous.id}}):null;
  const data={currencyId,accountKind:kind,displayName,bankName:kind==='CASH'?'':text('bankName',120),accountNumber:kind==='CASH'?'':text('accountNumber',100),accountHolder:kind==='CASH'?'':text('accountHolder',160),updatedByEmployeeId:actorId};
  if(linked&&(previous.currencyId!==currencyId||previous.accountKind!==kind||previous.bankName!==data.bankName||previous.accountNumber!==data.accountNumber))throw createHttpError(409,'LEDGER_ACCOUNT_IDENTITY_LOCKED');
  const result=id?await tx.organizationBankAccount.update({where:{id},data,include:BANK_INCLUDE}):await tx.organizationBankAccount.create({data:{...data,orgId,entityId,sortOrder:(await tx.organizationBankAccount.count({where:{orgId,entityId}})),createdByEmployeeId:actorId},include:BANK_INCLUDE});
  if(entityId===orgId&&!linked){
    const ledger=await tx.bankLedgerAccount.create({data:{orgId,entityAccountId:result.id,clientKey:'entity:'+result.id,bankName:data.bankName,accountNumber:data.accountNumber,accountHolder:data.accountHolder,currencyCode:result.currency.code,openingDate:LEDGER_ZERO_START,openingBalance:'0',createdBy:(await tx.employee.findUnique({where:{id:actorId},select:{email:true}}))?.email||'employee:'+actorId}});
    result.ledgerAccounts=[ledger];
  }

  return result;
}
export function registerEntityBankRoutes(app:any,db:any,gates:any) {
  const access=async(req:any,res:any)=>{
    const auth=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT']});if(!auth)return null;
    const orgId=auth.organization.id,entityId=Number(req.params.entityId);
    await requireEntityAccess(db,orgId,entityId);
    const role=auth.employee?.orgRole,type=auth.organization.type;
    const canLedger=['ADMIN','ACCOUNTANT'].includes(role)&&!!(await gates.loadPolicy())?.policy?.[type]?.[role]?.includes('BANK_LEDGER');
    return {orgId,entityId,actorId:gates.getActor(req),role,type,canLedger};
  };
  app.get('/entities/:entityId/bank-accounts',async(req:any,res:any)=>{const scope=await access(req,res);if(!scope)return;
    const accounts=await db.organizationBankAccount.findMany({where:{orgId:scope.orgId,entityId:scope.entityId},include:{...BANK_INCLUDE,ledgerAccounts:scope.canLedger?BANK_INCLUDE.ledgerAccounts:{select:{id:true}}},orderBy:[{sortOrder:'asc'},{createdAt:'asc'},{id:'asc'}]});res.json({accounts,revision:editRevision(accounts),canLedger:scope.canLedger,currencies:await db.currency.findMany({orderBy:{code:'asc'}})});
  });
  app.put('/entities/:entityId/bank-accounts/order',async(req:any,res:any)=>{const scope=await access(req,res);if(!scope)return;
    if(!scope.actorId)return res.status(403).json({error:'EMPLOYEE_REQUIRED'});
    await retryEditTransaction(db,async(tx:any)=>{
      await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',scope.entityId);
      const accounts=await tx.organizationBankAccount.findMany({where:{orgId:scope.orgId,entityId:scope.entityId},include:{...BANK_INCLUDE,ledgerAccounts:scope.canLedger?BANK_INCLUDE.ledgerAccounts:{select:{id:true}}},orderBy:[{sortOrder:'asc'},{createdAt:'asc'},{id:'asc'}]});
      assertEditRevision(req.body.revision,editRevision(accounts));
      const ids=req.body.ids;
      if(!Array.isArray(ids)||ids.length!==accounts.length||new Set(ids).size!==ids.length||ids.some((id:any)=>!accounts.some((row:any)=>row.id===id)))throw createHttpError(400,'INVALID_ACCOUNT_ORDER');
      for(const [sortOrder,id] of ids.entries())await tx.organizationBankAccount.update({where:{id},data:{sortOrder,updatedByEmployeeId:scope.actorId}});
    });res.json({ok:true});
  });
  for(const method of ['post','put'])app[method](method==='post'?'/entities/:entityId/bank-accounts':'/entities/:entityId/bank-accounts/:id',async(req:any,res:any)=>{const scope=await access(req,res);if(!scope)return;
    if(!scope.actorId)return res.status(403).json({error:'EMPLOYEE_REQUIRED'});
    if(req.body.openingDate!==undefined||req.body.openingBalance!==undefined){
      if(!scope.canLedger)return res.status(403).json({error:'LEDGER_ACCESS_DENIED'});
    }
    const result=await db.$transaction((tx:any)=>saveEntityBankAccount(tx,scope.orgId,scope.actorId,scope.entityId,method==='put'?req.params.id:null,req.body),{isolationLevel:'Serializable'});
    if(!scope.canLedger)result.ledgerAccounts=result.ledgerAccounts.map((row:any)=>({id:row.id}));
    res.status(method==='post'?201:200).json(result);
  });
}
