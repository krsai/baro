// Receipt and transport progress remain separate stored values.
export function shippingState(job,{request=false}={}){
 if(job.status==='CANCELLED')return 'CANCELLED';
 if(job.receiptStatus==='PENDING')return 'PENDING';
 return request?'ACCEPTED':job.status||'DRAFT';
}
