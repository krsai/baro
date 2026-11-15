const keys=row=>[row?.id&&'org:'+row.id,row?.linkedCompany?.id&&'org:'+row.linkedCompany.id,row?.linkedCompany?.sourceEntityId&&'org:'+row.linkedCompany.sourceEntityId,row?.linkedCompany?.identityId&&'identity:'+row.linkedCompany.identityId].filter(Boolean);
export const sameShippingParty=(left,right)=>keys(left).some(key=>keys(right).includes(key));
export const shippingPartyConflictText={ko:'쉬퍼와 컨사이니는 서로 다른 업체를 선택해 주세요.',en:'Select different companies for shipper and consignee.',vi:'Vui lòng chọn công ty khác nhau cho người gửi và người nhận.'};
