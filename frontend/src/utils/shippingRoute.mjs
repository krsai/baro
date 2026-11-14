import {routeNodes} from '../constants/freightRouteScope.js';
export function routeLocations(data,mode){
 const result={...data.routeLocations};
 // Read legacy endpoints without rewriting the saved record on view.
 if(!data.routeLocations){
  if(data.workScope?.start)result[data.workScope.start]=data.origin||'';
  if(data.workScope?.end)result[data.workScope.end]=data.destination||'';
  if(mode==='SEA')for(const [node,key]of [['ORIGIN_TERMINAL','originPortCode'],['DESTINATION_TERMINAL','destinationPortCode']])if(data[key]&&!result[node])result[node]=data[key];
 }
 return result;
}
export function routePatch(data,mode,scope,locations=routeLocations(data,mode)){
 return {workScope:scope,routeLocations:locations,origin:locations[scope.start]||'',destination:locations[scope.end]||'',...(mode!=='SEA'?{originPortCode:null,destinationPortCode:null}:{})};
}
export function routeComplete(data,mode){
 const nodes=routeNodes(mode,data.transportService),start=nodes.indexOf(data.workScope?.start),end=nodes.indexOf(data.workScope?.end),locations=routeLocations(data,mode);
 return start>=0&&end>start&&nodes.slice(start,end+1).every(node=>locations[node]?.trim()&&(mode!=='SEA'||!node.endsWith('TERMINAL')||data[node==='ORIGIN_TERMINAL'?'originPortCode':'destinationPortCode']));
}
