import {createHttpError} from '../utils/http';
import {calculateOrderSalesValue} from '../utils/orderSalesValue';
import {approvalState} from './bankEvidence';
export async function revenueStyles(db:any,orgId:number,search=''){
 const rows=await db.style.findMany({where:{orgId,...(search?{OR:[{code:{contains:search,mode:'insensitive'}},{name:{contains:search,mode:'insensitive'}},{customerOrganization:{name:{contains:search,mode:'insensitive'}}}]}:{})},select:{id:true,code:true,name:true,customerOrganization:{select:{name:true}}},orderBy:{updatedAt:'desc'},take:201});
 return {styles:rows.slice(0,200).map((row:any)=>({id:row.id,code:row.code,name:row.name,customer:row.customerOrganization?.name||''})),truncated:rows.length>200};
}
export async function revenueStyleReport(db:any,orgId:number,styleId:number,quantity:number,gender:string|null,gates:any){
 const style=await db.style.findFirst({where:{id:styleId,orgId},include:{customerOrganization:{select:{name:true}}}});if(!style)throw createHttpError(404,'PROFIT_TARGET_NOT_FOUND');
 const relationship=await db.orgRelationship.findFirst({where:{manufacturerOrgId:orgId,brandOrgId:style.customerOrgId},include:{salesBucketSetVersion:{include:{entries:true}},salesBucketOverrides:{where:{styleId},include:{quantityBucketSetVersion:{include:{entries:true}}}},salesPriceLists:{where:{styleId},include:{currency:true,prices:{include:{quantityBucketEntry:true}}}}}});
 const sales=calculateOrderSalesValue({workOrderItems:[{styleId,totalQuantity:quantity,style}]},relationship),line=sales.lines[0];
 const version=await db.styleProcessVersion.findFirst({where:{orgId,styleId},orderBy:{versionNumber:'desc'}}),processes=version?.processSnapshot??(gates.loadCurrentProcesses?await gates.loadCurrentProcesses(db,orgId,styleId):null);
 const times=processes&&gates.resolveTimes?gates.resolveTimes(processes,[{styleId,totalQuantity:quantity,gender}]):{ST:null,PT:null};
 const costs=await db.partnerTransactionCost.findMany({where:{orgId,OR:[{styleId},{referenceLinks:{some:{orgId,styleId}}}],AND:[{OR:[{expenseRequestId:null},{expenseRequest:{deletedAt:null}}]}]},include:{referenceLinks:true,transactionCode:true,expenseRequest:{select:{managementNumber:true}}},orderBy:{transactionDate:'desc'}});
 const items=await db.workOrderItem.findMany({where:{styleId,workOrder:{orgId}},select:{workOrderId:true,totalQuantity:true}}),quantities=new Map<number,number>();
 for(const item of items)quantities.set(item.workOrderId,(quantities.get(item.workOrderId)||0)+item.totalQuantity);
 const states=new Map<number,boolean>(),groups=new Map<string,any>(),history:any[]=[];
 for(const cost of costs){
  if(cost.expenseRequestId&&!states.has(cost.expenseRequestId))states.set(cost.expenseRequestId,(await approvalState(db,orgId,cost.expenseRequestId)).approved);
  const approved=cost.expenseRequestId?!!states.get(cost.expenseRequestId):false;
  history.push({id:cost.id,date:cost.transactionDate,code:cost.transactionCode,description:cost.description,subtotal:cost.subtotal==null?null:String(cost.subtotal),amount:String(cost.amount),currency:cost.currency,reference:cost.expenseRequest?.managementNumber||'',requestId:cost.expenseRequestId,approved,exact:false,withinOrder:false,historical:true});
  const refs=cost.referenceLinks.length?cost.referenceLinks.map((row:any)=>[row.workOrderId,row.styleId]):[[cost.workOrderId,cost.styleId]];
  if(!approved||cost.subtotal==null||refs.length!==1||refs[0][1]!==styleId||!((quantities.get(refs[0][0])||0)>0))continue;
  const group=groups.get(cost.currency)||{currency:cost.currency,amount:0,orders:new Set<number>()};group.amount+=Number(cost.subtotal);group.orders.add(refs[0][0]);groups.set(cost.currency,group);
 }
 const estimatedPurchases=[...groups.values()].map(group=>{const quantityBasis=[...group.orders].reduce((sum:number,id:any)=>sum+(quantities.get(id)||0),0);return {currency:group.currency,unitCost:group.amount/quantityBasis,quantityBasis,orderCount:group.orders.size};});
 return {order:{id:null,orderNumber:style.code,customer:style.customerOrganization?.name||'',quantity,styleCount:1,salesAmount:sales.amount,currency:sales.currencyCode,priceSource:'CURRENT_PRICE',analysisMode:'STYLE'},styles:[{styleId,styleCode:style.code,styleName:style.name,quantity,salePrice:line?.unitPrice??null,salesAmount:line?.amount??null,currency:sales.currencyCode,analysisMode:'STYLE',sources:{times,version:version?.versionNumber||null,costs:history,averages:[],estimatedPurchases}}]};
}
