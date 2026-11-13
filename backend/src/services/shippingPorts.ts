import {createHttpError} from '../utils/http';
export async function searchShippingPorts(db:any,query:unknown){
 if(typeof query!=='string'||query.length>160)throw createHttpError(400,'SHIPPING_INVALID');
 // Literal substring search; user %/_ must not become SQL wildcards.
 const q=query.trim().replace(/[\\%_]/g,'\\$&'),pattern=`%${q}%`;
 const rows=await db.$queryRawUnsafe(`SELECT code,country,name,"asciiName",subdivision,iata,"sourceVersion" FROM "ShippingPort"
 WHERE code ILIKE $1 OR name ILIKE $1 OR "asciiName" ILIKE $1 OR country ILIKE $1 OR replace(code,' ','') ILIKE $2
 ORDER BY (code=$3) DESC, country,name,code LIMIT 201`,pattern,`%${q.replace(/\s/g,'')}%`,query.trim().replace(/\s/g,'').toUpperCase());
 return {rows:rows.slice(0,200),hasMore:rows.length>200};
}
export function shippingPortFields(data:any,mode:string){
 if(data.cargoSchemaVersion!==1)return {};
 const result:any={};
 for(const key of ['originPortCode','destinationPortCode'])if(data[key]!=null&&data[key]!==''){
  if(mode!=='SEA'||typeof data[key]!=='string'||! /^[A-Z]{2}[A-Z0-9]{3}$/.test(data[key]))throw createHttpError(400,'SHIPPING_INVALID');
  result[key]=data[key];
 }
 return result;
}
export async function validateShippingPorts(db:any,data:any){
 for(const key of ['originPortCode','destinationPortCode'])if(data[key]){
  const rows=await db.$queryRawUnsafe('SELECT code FROM "ShippingPort" WHERE code=$1',data[key]);
  if(!rows.length)throw createHttpError(400,'SHIPPING_INVALID');
 }
}
