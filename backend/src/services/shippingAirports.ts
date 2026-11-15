import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHttpError} from '../utils/http';
type Airport={id:string,code:string,name:string,country:string,city:string,icao:string};
let catalogue:Airport[]|undefined;
export function searchShippingAirports(query:unknown){
 if(typeof query!=='string'||query.length>160)throw createHttpError(400,'SHIPPING_INVALID');
 catalogue??=JSON.parse(readFileSync(join(__dirname,'../../data/shipping-airports.json'),'utf8'));
 const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
 const q=normalize(query.trim()),matches=catalogue!.filter(row=>normalize([row.code,row.name,row.city,row.country,row.icao].join(' ')).includes(q));
 matches.sort((a,b)=>Number(b.code.toLowerCase()===q)-Number(a.code.toLowerCase()===q)||a.code.localeCompare(b.code)||a.id.localeCompare(b.id));
 return {rows:matches.slice(0,200),hasMore:matches.length>200};
}
