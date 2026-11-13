import {createHttpError} from '../utils/http';
export function shippingRouteFields(data:any,mode:string){
 if(data.routeLocations===undefined)return {};
 const fail=():never=>{throw createHttpError(400,'SHIPPING_ROUTE_REQUIRED');};
 const nodes=mode==='ROAD'?['ORIGIN_DOOR','DESTINATION_DOOR']:['ORIGIN_DOOR','ORIGIN_TERMINAL','DESTINATION_TERMINAL','DESTINATION_DOOR'];
 if(!data.routeLocations||typeof data.routeLocations!=='object'||Array.isArray(data.routeLocations))fail();
 const locations:any={};
 for(const node of nodes)if(data.routeLocations[node]!==undefined){const v=data.routeLocations[node];if(typeof v!=='string'||v.length>160)fail();locations[node]=v.trim();}
 const start=nodes.indexOf(data.workScope?.start),end=nodes.indexOf(data.workScope?.end);if(start<0||end<=start)fail();
 for(const node of nodes.slice(start,end+1))if(!locations[node]||(mode==='SEA'&&node.endsWith('TERMINAL')&&!data[node==='ORIGIN_TERMINAL'?'originPortCode':'destinationPortCode']))fail();
 return {routeLocations:locations,origin:locations[nodes[start]!],destination:locations[nodes[end]!]};
}
