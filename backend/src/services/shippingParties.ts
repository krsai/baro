import {createHttpError} from '../utils/http';
const keys=(row:any)=>[row?.id&&'org:'+row.id,row?.linkedCompany?.id&&'org:'+row.linkedCompany.id,row?.linkedCompany?.sourceEntityId&&'org:'+row.linkedCompany.sourceEntityId,row?.linkedCompany?.identityId&&'identity:'+row.linkedCompany.identityId].filter(Boolean);
export function assertDistinctShippingParties(left:any,right:any){
 if(keys(left).some(key=>keys(right).includes(key)))throw createHttpError(400,'SHIPPING_PARTIES_OVERLAP');
}
