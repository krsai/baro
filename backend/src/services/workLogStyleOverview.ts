import {invoiceOrderProgress} from './invoiceOrderProgress';
import {orderAssignmentPlans} from './orderAssignments';
// Read-only order/style context. Keep unavailable rows separate from real selectable plans.
export async function workLogStyleOverview(db:any,orgId:number,loadProgress:(ids:string[])=>Promise<any[]>){
 const orders=await db.workOrder.findMany({where:{orgId},select:{id:true,orderId:true,orderNumber:true,workOrderItems:{select:{styleId:true,totalQuantity:true,style:{select:{code:true,name:true}}}},priorCompletions:{where:{canceledAt:null}}},orderBy:[{createdAt:'desc'},{id:'desc'}]});
 if(!orders.length)return [];
 const ids=orders.map((row:any)=>row.id);
 const plans=await db.assignmentPlan.findMany({where:{orgId,OR:[{workOrderId:{in:ids}},{workOrderId:null,assignmentCard:{is:{workOrderId:{in:ids}}}}]},select:{externalId:true,workOrderId:true,styleId:true,factoryId:true,factory:{select:{name:true}},assignmentCard:{select:{workOrderId:true}}}});
 const progress=plans.length?await loadProgress(plans.map((row:any)=>row.externalId)):[];
 const completedIds=new Set(progress.filter((row:any)=>row.isCompleted===true).map((row:any)=>row.id));
 return orders.flatMap((order:any)=>invoiceOrderProgress(order,plans,progress).styles.filter((style:any)=>style.orderedQuantity>0).map((style:any)=>{
  const item=order.workOrderItems.find((item:any)=>item.styleId===style.styleId),related=orderAssignmentPlans(order.id,plans).filter((plan:any)=>plan.styleId===style.styleId);
  return {workOrderId:order.id,orderId:order.orderId,orderNo:order.orderNumber,styleId:style.styleId,styleCode:item?.style?.code||'',styleName:item?.style?.name||'',orderedQuantity:style.orderedQuantity,producedQuantity:style.producedQuantity,isCompleted:style.isCompleted,isProgressUnknown:style.isProgressUnknown,isAssigned:related.length>0,assignmentIds:related.map((plan:any)=>plan.externalId),completedAssignmentIds:related.filter((plan:any)=>completedIds.has(plan.externalId)).map((plan:any)=>plan.externalId),factoryNames:[...new Set(related.map((plan:any)=>plan.factory?.name).filter(Boolean))]};
 }));
}
