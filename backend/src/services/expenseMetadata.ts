import {createHttpError} from '../utils/http';
import {normalizeLocalizedName,validLocalizedName} from '../utils/localizedName';
const fail=(code:string):never=>{throw createHttpError(400,code);};
const positive=(value:any)=>Number.isSafeInteger(value)&&value>0;
export async function prepareExpenseMetadata(tx:any,orgId:number,body:any,previous?:any){
  const supplied=body.linkedOrderIds!==undefined||body.linkedStyles!==undefined;
  const orderIds=body.linkedOrderIds??(body.workOrderId?[body.workOrderId]:[]);
  const styles=body.linkedStyles??(body.styleId?[{workOrderId:body.workOrderId,styleId:body.styleId}]:[]);
  if(!Array.isArray(orderIds)||orderIds.length>100||orderIds.some(id=>!positive(id))||new Set(orderIds).size!==orderIds.length||!Array.isArray(styles)||styles.length>200)fail('INVALID_EXPENSE_REFERENCES');
  const keys=new Set();
  for(const link of styles){
    if(!link||!positive(link.workOrderId)||!positive(link.styleId)||!orderIds.includes(link.workOrderId))fail('INVALID_EXPENSE_REFERENCES');
    const key=`${link.workOrderId}:${link.styleId}`;
    if(keys.has(key))fail('INVALID_EXPENSE_REFERENCES');keys.add(key);
  }
  if(supplied){
    if(orderIds.length&&(await tx.workOrder.findMany({where:{orgId,id:{in:orderIds}},select:{id:true}})).length!==orderIds.length)fail('INVALID_TRANSACTION_ORDER');
    for(const link of styles){
      const retained=previous?.workOrderId===link.workOrderId&&previous?.styleId===link.styleId||previous?.referenceLinks?.some((row:any)=>row.workOrderId===link.workOrderId&&row.styleId===link.styleId);
      if(!retained&&!await tx.workOrderItem.findFirst({where:{workOrderId:link.workOrderId,styleId:link.styleId,workOrder:{orgId},style:{orgId}},select:{id:true}}))fail('INVALID_REQUEST_STYLE');
    }
  }
  let unitId=body.unitId===undefined?previous?.unitId??null:body.unitId;
  if(unitId==='')unitId=null;
  if(unitId!=null){
    if(!positive(unitId))fail('INVALID_EXPENSE_UNIT');
    const unit=await tx.expenseUnit.findUnique({where:{id:unitId}});
    if(!unit||!unit.isActive&&previous?.unitId!==unitId)fail('INVALID_EXPENSE_UNIT');
  }
  return {unitId,supplied,orderIds,styles:styles.map((link:any)=>({workOrderId:link.workOrderId,styleId:link.styleId}))};
}
export async function saveExpenseReferences(tx:any,cost:any,metadata:any){
  if(!metadata.supplied)return;
  await tx.expenseItemReference.deleteMany({where:{costId:cost.id,orgId:cost.orgId}});
  const data=[...metadata.orderIds.map((workOrderId:number)=>({costId:cost.id,orgId:cost.orgId,workOrderId,styleId:null})),...metadata.styles.map((link:any)=>({costId:cost.id,orgId:cost.orgId,...link}))];
  if(data.length)await tx.expenseItemReference.createMany({data});
}
export function registerExpenseUnitRoutes(app:any,db:any,gates:any){
  app.get('/expense-units',async(req:any,res:any)=>{
    if(!await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT']}))return;
    res.json(await db.expenseUnit.findMany({orderBy:[{sortOrder:'asc'},{id:'asc'}]}));
  });
  const path='/system-setting-defaults/expense-units';
  app.get(path,async(req:any,res:any)=>{
    if(!await gates.requireSystemAdmin(req,res))return;
    res.json(await db.expenseUnit.findMany({orderBy:[{sortOrder:'asc'},{id:'asc'}]}));
  });
  for(const update of [false,true])app[update?'put':'post'](path+(update?'/:id':''),async(req:any,res:any)=>{
    if(!await gates.requireSystemAdmin(req,res))return;
    const body=req.body;
    if(!validLocalizedName(body,100)||!/^[A-Z][A-Z0-9_]{0,29}$/.test(body.code)||!Number.isSafeInteger(body.sortOrder??0))fail('INVALID_EXPENSE_UNIT');
    const data={...normalizeLocalizedName(body),code:body.code,isActive:body.isActive!==false,sortOrder:body.sortOrder??0};
    if(update&&!positive(Number(req.params.id)))fail('INVALID_EXPENSE_UNIT');
    try{res.json(update?await db.expenseUnit.update({where:{id:Number(req.params.id)},data}):await db.expenseUnit.create({data}));}
    catch(error:any){if(error.code==='P2002')throw createHttpError(409,'EXPENSE_UNIT_DUPLICATE');throw error;}
  });
}
