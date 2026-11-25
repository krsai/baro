import {routeNodes} from '../constants/freightRouteScope.js';
// Use saved terminal values for sea/air; a door address is never inferred to be a port.
export function workRoute(job){
 const data=job.data||{},locations=data.routeLocations||{},terminal=job.service!=='EXPRESS'&&['SEA','AIR'].includes(job.mode);
 if(terminal)return {
  from:{label:job.mode==='SEA'?'loadingPort':'originAirport',value:locations.ORIGIN_TERMINAL||data.originPortCode||''},
  to:{label:job.mode==='SEA'?'dischargePort':'destinationAirport',value:locations.DESTINATION_TERMINAL||data.destinationPortCode||''}
 };
 return {from:{label:'pickup',value:locations.ORIGIN_DOOR||data.origin||''},to:{label:'delivery',value:locations.DESTINATION_DOOR||data.destination||''}};
}
export function workRouteSteps(job){
 const data=job.data||{},nodes=routeNodes(job.mode,job.service),locations=data.routeLocations||{},route=workRoute(job);
 const values={ORIGIN_DOOR:data.origin||'',ORIGIN_TERMINAL:route.from.value,DESTINATION_TERMINAL:route.to.value,DESTINATION_DOOR:data.destination||''};
 const labels={ORIGIN_DOOR:'pickup',ORIGIN_TERMINAL:job.mode==='AIR'?'originAirport':'loadingPort',DESTINATION_TERMINAL:job.mode==='AIR'?'destinationAirport':'dischargePort',DESTINATION_DOOR:'delivery'};
 const start=nodes.indexOf(data.workScope?.start),end=nodes.indexOf(data.workScope?.end);
 const selected=start>=0&&end>start?nodes.slice(start,end+1):nodes.filter(node=>node.endsWith('DOOR')||values[node]);
 return selected.map((node,index)=>({node,label:labels[node],field:index===0?'origin':index===selected.length-1?'destination':null,value:locations[node]||values[node],name:data.routeLocationDetails?.[node]?.label?.trim()||''}));
}
export function routeStopText(name,address){
 const label=String(name||'').trim(),value=String(address||'').trim();
 return label&&value&&label!==value?`${label} (${value})`:label||value;
}
export function routeDateComplete(date,today){
 return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date&&date<today;
}
export function workCargo(data){
 const positive=value=>value!==''&&value!=null&&Number.isFinite(Number(value))&&Number(value)>0;
 return [data.cargo,...(data.containers||[]).filter(row=>positive(row.count)).map(row=>`${[row.size&&`${row.size}'`,row.type].filter(Boolean).join(' ')} × ${row.count}`),
  positive(data.quantity)&&[data.quantity,data.unit].filter(Boolean).join(' '),positive(data.weightKg)&&`${data.weightKg} kg`,positive(data.cbm)&&`${data.cbm} CBM`].filter(Boolean);
}
