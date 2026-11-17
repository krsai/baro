// Only invalidation metadata crosses the connection; document reads remain authorized APIs.
export const LIVE_TOPICS=['shipping','shipping-ports','styles','orders','order-shipments','invoice-drafts','issued-invoices','assignment-board','employees','sales-prices','customers','business-partners','production-allowance-settings','salary-system-settings','payroll-sources','expense-requests','expense-approvals','change-approvals','bank-ledger','work-requests'];
export async function readWorkspaceEvents(response,{signal,onReady,onChange}){
 if(!response.ok||!response.body)throw Object.assign(Error('WORKSPACE_EVENTS_UNAVAILABLE'),{status:response.status});
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
 try{
  while(!signal.aborted){
   const {done,value}=await reader.read();if(done)break;
   buffer+=decoder.decode(value,{stream:true}).replace(/\r/g,'');
   if(buffer.length>65536)throw Error('WORKSPACE_EVENT_TOO_LARGE');
   let end;while((end=buffer.indexOf('\n\n'))>=0){
    const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);
    if(frame.startsWith('event: ready'))onReady();
    else{const data=frame.split('\n').filter(line=>line.startsWith('data: ')).map(line=>line.slice(6)).join('\n');if(data){let event;try{event=JSON.parse(data);}catch{continue;}onChange(event);}}
   }
  }
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
