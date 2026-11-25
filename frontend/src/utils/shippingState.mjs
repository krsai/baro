// Receipt and transport progress remain separate stored values.
export function shippingState(job,{request=false}={}){
 if(job.status==='CANCELLED')return 'CANCELLED';
 if(job.receiptStatus==='REJECTED')return 'REJECTED';
 if(job.receiptStatus==='PENDING')return 'PENDING';
 if(job.receiptStatus==='ACCEPTED'&&(!job.status||job.status==='DRAFT'))return 'ACCEPTED';
 return request?'ACCEPTED':job.status||'DRAFT';
}
