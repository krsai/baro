import { createHttpError } from '../utils/http';

export const BANK_INCLUDE = {currency:{select:{id:true,code:true,name:true}}};
export async function requireEntityAccess(db:any,orgId:number,entityId:number) {
  if(!Number.isSafeInteger(entityId)||entityId<=0)throw createHttpError(400,'INVALID_ENTITY');
  const entity=await db.organization.findFirst({where:{id:entityId,OR:[{id:orgId},{ownerOrgId:orgId},{dataOwnerOrgId:orgId},
    {brandRelationships:{some:{manufacturerOrgId:orgId}}},{manufacturerRelationships:{some:{brandOrgId:orgId}}}]},select:{id:true}});
  if(!entity)throw createHttpError(404,'ENTITY_NOT_FOUND');
  return entity;
}
export async function requirePayeeBankAccount(tx:any,orgId:number,entityId:number) {
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',entityId);
  const account=await tx.organizationBankAccount.findFirst({where:{orgId,entityId,isActive:true},select:{id:true}});
  if(!account)throw createHttpError(400,'PAYEE_BANK_ACCOUNT_REQUIRED');
}
export async function saveEntityBankAccount(tx:any,orgId:number,actorId:number,entityId:number,id:string|null,body:any) {
  await requireEntityAccess(tx,orgId,entityId);
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',entityId);
  const previous=id ? await tx.organizationBankAccount.findFirst({where:{id,orgId,entityId}}) : null;
  if(id&&!previous)throw createHttpError(404,'BANK_ACCOUNT_NOT_FOUND');
  const text=(key:string,max:number)=>{const value=typeof body?.[key]==='string'?body[key].trim():'';if(!value||value.length>max||/[\r\n]/.test(value))throw createHttpError(400,'INVALID_BANK_ACCOUNT');return value;};
  const currencyId=Number(body?.currencyId);
  if(!Number.isSafeInteger(currencyId)||currencyId<=0||!await tx.currency.findUnique({where:{id:currencyId}}))throw createHttpError(400,'INVALID_CURRENCY');
  const isActive=body.isActive!==false;
  const existingDefault=await tx.organizationBankAccount.findFirst({where:{orgId,entityId,currencyId,isActive:true,isDefault:true,...(id?{id:{not:id}}:{})}});
  const isDefault=isActive && (body.isDefault===true || !existingDefault);
  if(isDefault)await tx.organizationBankAccount.updateMany({where:{orgId,entityId,currencyId,isDefault:true,...(id?{id:{not:id}}:{})},data:{isDefault:false,updatedByEmployeeId:actorId}});
  const data={currencyId,bankName:text('bankName',120),accountNumber:text('accountNumber',100),accountHolder:text('accountHolder',160),isActive,isDefault,updatedByEmployeeId:actorId};
  const result=id ? await tx.organizationBankAccount.update({where:{id},data,include:BANK_INCLUDE}) : await tx.organizationBankAccount.create({data:{...data,orgId,entityId,createdByEmployeeId:actorId},include:BANK_INCLUDE});
  if(previous && (previous.currencyId!==currencyId||!isActive) && previous.isDefault){
    const replacement=await tx.organizationBankAccount.findFirst({where:{orgId,entityId,currencyId:previous.currencyId,isActive:true,isDefault:false},orderBy:{createdAt:'asc'}});
    if(replacement)await tx.organizationBankAccount.update({where:{id:replacement.id},data:{isDefault:true,updatedByEmployeeId:actorId}});
  }
  return result;
}
export function registerEntityBankRoutes(app:any,db:any,gates:any) {
  const access=async(req:any,res:any)=>{
    const auth=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT']});if(!auth)return null;
    const orgId=auth.organization.id,entityId=Number(req.params.entityId);
    await requireEntityAccess(db,orgId,entityId);
    return {orgId,entityId,actorId:gates.getActor(req)};
  };
  app.get('/entities/:entityId/bank-accounts',async(req:any,res:any)=>{const scope=await access(req,res);if(!scope)return;
    res.json({accounts:await db.organizationBankAccount.findMany({where:{orgId:scope.orgId,entityId:scope.entityId},include:BANK_INCLUDE,orderBy:[{isActive:'desc'},{currencyId:'asc'},{isDefault:'desc'},{createdAt:'asc'}]}),currencies:await db.currency.findMany({orderBy:{code:'asc'}})});
  });
  for(const method of ['post','put'])app[method](method==='post'?'/entities/:entityId/bank-accounts':'/entities/:entityId/bank-accounts/:id',async(req:any,res:any)=>{const scope=await access(req,res);if(!scope)return;
    if(!scope.actorId)return res.status(403).json({error:'EMPLOYEE_REQUIRED'});
    const result=await db.$transaction((tx:any)=>saveEntityBankAccount(tx,scope.orgId,scope.actorId,scope.entityId,method==='put'?req.params.id:null,req.body),{isolationLevel:'Serializable'});
    res.status(method==='post'?201:200).json(result);
  });
}
