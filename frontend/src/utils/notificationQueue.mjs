export const TOAST_DURATION={success:3000,info:3000,warning:6000,error:6000};

export function createNotificationQueue(onChange,{schedule=setTimeout,cancel=clearTimeout}={}){
 let rows=[],sequence=0,timer=null;
 const publish=()=>{
  if(timer)cancel(timer);timer=null;
  const current=rows[0]||null;onChange(current);
  if(current&&!current.action&&!current.interactive){timer=schedule(()=>{rows.shift();publish();},TOAST_DURATION[current.type]??3000);}
 };
 return {
  show(message,type='info',options={}){
   if(!message)return;
   const row={...options,message,type,id:++sequence,sources:options.source?[options.source]:[]};
   const index=options.source?rows.findIndex(item=>item.sources.includes(options.source)):-1;
   const duplicate=options.dedupeKey?rows.findIndex(item=>item.dedupeKey===options.dedupeKey):-1;
   if(index>=0)rows[index]={...row,sources:rows[index].sources};
   else if(duplicate>=0)rows[duplicate].sources.push(options.source);
   else if(options.source)rows.push(row);
   else if(rows.length)rows[0]=row;
   else rows.push(row);
   publish();return row.id;
  },
  dismiss(){const current=rows.shift();publish();current?.onClose?.();},
  remove(source){if(!rows.some(row=>row.sources.includes(source)))return;rows=rows.map(row=>({...row,sources:row.sources.filter(value=>value!==source)})).filter(row=>!row.source||row.sources.length);publish();},
  dispose(){if(timer)cancel(timer);timer=null;rows=[];},
 };
}
