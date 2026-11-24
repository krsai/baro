// Use saved terminal values for sea/air; a door address is never inferred to be a port.
export function workRoute(job){
 const data=job.data||{},locations=data.routeLocations||{},terminal=job.service!=='EXPRESS'&&['SEA','AIR'].includes(job.mode);
 if(terminal)return {
  from:{label:job.mode==='SEA'?'loadingPort':'originAirport',value:locations.ORIGIN_TERMINAL||data.originPortCode||''},
  to:{label:job.mode==='SEA'?'dischargePort':'destinationAirport',value:locations.DESTINATION_TERMINAL||data.destinationPortCode||''}
 };
 return {from:{label:'pickup',value:locations.ORIGIN_DOOR||data.origin||''},to:{label:'delivery',value:locations.DESTINATION_DOOR||data.destination||''}};
}
export function workCargo(data){
 const positive=value=>value!==''&&value!=null&&Number.isFinite(Number(value))&&Number(value)>0;
 return [data.cargo,...(data.containers||[]).filter(row=>positive(row.count)).map(row=>`${[row.size&&`${row.size}'`,row.type].filter(Boolean).join(' ')} × ${row.count}`),
  positive(data.quantity)&&[data.quantity,data.unit].filter(Boolean).join(' '),positive(data.weightKg)&&`${data.weightKg} kg`,positive(data.cbm)&&`${data.cbm} CBM`].filter(Boolean);
}
