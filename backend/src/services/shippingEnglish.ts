import {createHttpError} from '../utils/http';

export function assertShippingEnglish(value:any,previous:any={},keys=['name','address','contactName']){
 for(const key of keys){
  const text=value?.[key];
  if(typeof text!=='string'||text.trim()===String(previous?.[key]??'').trim())continue;
  if(/[\r\n]/.test(text)||[...text].some(char=>/\p{L}/u.test(char)&&!/\p{Script=Latin}/u.test(char)))throw createHttpError(400,'SHIPPING_ENGLISH_REQUIRED');
 }
}
export function assertShippingEnglishData(data:any,previous:any={}){
 assertShippingEnglish(data,previous,['actualRequesterName','actualRequesterAddress','origin','destination']);
 for(const role of ['shipper','consignee','notify'])assertShippingEnglish(data[role+'Party'],previous[role+'Party']);
 for(const node of ['ORIGIN_DOOR','ORIGIN_TERMINAL','DESTINATION_TERMINAL','DESTINATION_DOOR']){
  assertShippingEnglish(data.routeLocationDetails?.[node],previous.routeLocationDetails?.[node],['label','contactName']);
  assertShippingEnglish({address:data.routeLocations?.[node]},{address:previous.routeLocations?.[node]});
 }
}
