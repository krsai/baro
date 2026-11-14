import {createHttpError} from '../utils/http';
export function shippingRouteFields(data:any,mode:string){
 if(data.routeLocations===undefined&&data.routeLocationDetails===undefined)return {};
 const fail=():never=>{throw createHttpError(400,'SHIPPING_ROUTE_REQUIRED');};
 const expressDoors=mode==='AIR'&&data.transportService==='EXPRESS'&&data.workScope?.start==='ORIGIN_DOOR'&&data.workScope?.end==='DESTINATION_DOOR';
 const nodes=mode==='ROAD'||expressDoors?['ORIGIN_DOOR','DESTINATION_DOOR']:['ORIGIN_DOOR','ORIGIN_TERMINAL','DESTINATION_TERMINAL','DESTINATION_DOOR'];
 const storedNodes=mode==='ROAD'?nodes:['ORIGIN_DOOR','ORIGIN_TERMINAL','DESTINATION_TERMINAL','DESTINATION_DOOR'];
 if(!data.routeLocations||typeof data.routeLocations!=='object'||Array.isArray(data.routeLocations))fail();
 const locations:any={};
 for(const node of storedNodes)if(data.routeLocations[node]!==undefined){const v=data.routeLocations[node];if(typeof v!=='string'||v.length>160)fail();locations[node]=v.trim();}
 const start=nodes.indexOf(data.workScope?.start),end=nodes.indexOf(data.workScope?.end);if(start<0||end<=start)fail();
 for(const node of nodes.slice(start,end+1))if(!locations[node]||(mode==='SEA'&&node.endsWith('TERMINAL')&&!data[node==='ORIGIN_TERMINAL'?'originPortCode':'destinationPortCode']))fail();
 const details:any={};
 if(data.routeLocationDetails!==undefined){
  if(!data.routeLocationDetails||typeof data.routeLocationDetails!=='object'||Array.isArray(data.routeLocationDetails))fail();
  for(const node of storedNodes)if(data.routeLocationDetails[node]!==undefined){
   const source=data.routeLocationDetails[node];if(!source||typeof source!=='object'||Array.isArray(source))fail();
   const contact:any={};for(const [key,max]of Object.entries({label:200,contactName:320,phone:320})){
    const value=source[key]??'';if(typeof value!=='string'||value.length>max)fail();contact[key]=value.trim();
   }details[node]=contact;
  }
 }
 return {routeLocations:locations,...(data.routeLocationDetails===undefined?{}:{routeLocationDetails:details}),origin:locations[nodes[start]!],destination:locations[nodes[end]!]};
}
