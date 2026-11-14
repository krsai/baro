import dayjs from 'dayjs';
import {shippingEditorText} from '../constants/shippingEditor';
import {freightJobEditorText} from '../constants/freightJobEditor';
export function shippingModeKey(job){
 const data=job.data||job.request?.data||{},mode=job.mode||job.request?.mode;
 return job.service==='EXPRESS'||data.transportService==='EXPRESS'?'EXPRESS':mode==='SEA'?data.shipmentType||'SEA':mode;
}
export function shippingModeLabel(job,languageCode){
 const x=shippingEditorText[languageCode]||shippingEditorText.en,e=freightJobEditorText[languageCode]||freightJobEditorText.en;
 return ({FCL:x.seaFcl,LCL:x.seaLcl,SEA:x.sea,AIR:x.air,ROAD:x.road,EXPRESS:e.EXPRESS})[shippingModeKey(job)]||'—';
}
export const shippingRequestDate=job=>job.createdAt&&dayjs(job.createdAt).isValid()?dayjs(job.createdAt).format('YYYY-MM-DD'):'—';
