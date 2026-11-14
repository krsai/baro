import {createHttpError} from '../utils/http';

const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
export function generalCustomerFields(data:any){
 const result:any={generalCustomer:true};
 for(const [key,max] of Object.entries({actualRequesterName:200,actualRequesterPhone:80})){
  const value=data[key];
  if(typeof value!=='string'||!value.trim()||value.length>max)fail('SHIPPING_REQUESTER_REQUIRED');
  result[key]=value.trim();
 }
 return result;
}
// Called only by authenticated SR/address-book writes, never by a read/options request.
export async function shippingGeneralCustomer(tx:any,orgId:number,actorId:number,customerId:any,requested:boolean){
 const existing=(await tx.$queryRawUnsafe('SELECT "customerId" FROM "ShippingGeneralCustomer" WHERE "orgId"=$1',orgId))[0];
 if(!requested)return existing?.customerId===customerId?existing.customerId:null;
 if(customerId!=null&&customerId!==existing?.customerId)fail('FREIGHT_PARTY_SCOPE',403);
 if(!await tx.organization.findFirst({where:{id:orgId,type:'SERVICE',isActive:true},select:{id:true}}))fail('SHIPPING_ACCESS_DENIED',403);
 await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
 const current=(await tx.$queryRawUnsafe('SELECT "customerId" FROM "ShippingGeneralCustomer" WHERE "orgId"=$1',orgId))[0];
 if(current)return current.customerId;
 const customer=await tx.organization.create({data:{name:'Express general customer',nameKo:'특송 일반고객',nameVi:'Khách lẻ chuyển phát',type:'MATERIAL_SUPPLIER',partyKind:'INDIVIDUAL',ownerOrgId:orgId}});
 await tx.$executeRawUnsafe('INSERT INTO "ShippingGeneralCustomer"("orgId","customerId","createdByEmployeeId") VALUES($1,$2,$3)',orgId,customer.id,actorId);
 return customer.id;
}
