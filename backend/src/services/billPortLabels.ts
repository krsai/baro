import {billPortLabel} from '../utils/billPortLabel';
import {shippingWorkData} from './shippingWorkData';

export async function billPortLabels(db:any,job:any){
 if(job.mode!=='SEA'||job.service==='EXPRESS')return {};
 const data=shippingWorkData(job.data||{}),codes=[data.originPortCode,data.destinationPortCode].filter(Boolean);
 if(!codes.length)return {};
 const rows=await db.$queryRawUnsafe('SELECT code,name,"asciiName",country FROM "ShippingPort" WHERE code=ANY($1::text[])',codes);
 const result:Record<string,string>={};
 for(const [key,code] of [['origin',data.originPortCode],['destination',data.destinationPortCode]]){
  const port=rows.find((row:any)=>row.code===code);if(port)result[key!]=billPortLabel(port.asciiName||port.name,port.code);
 }
 return result;
}
