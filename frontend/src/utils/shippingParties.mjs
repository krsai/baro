const keys=row=>[row?.id&&'org:'+row.id,row?.linkedCompany?.id&&'org:'+row.linkedCompany.id,row?.linkedCompany?.sourceEntityId&&'org:'+row.linkedCompany.sourceEntityId,row?.linkedCompany?.identityId&&'identity:'+row.linkedCompany.identityId].filter(Boolean);
export const sameShippingParty=(left,right)=>keys(left).some(key=>keys(right).includes(key));
export function shippingPartyChoices(parties,presets,{fixedPartyId,excludedParty}={}){
 const allowed=party=>!party?.isShippingGeneralCustomer&&(!fixedPartyId||party?.id===fixedPartyId)&&!sameShippingParty(party,excludedParty);
 const seen=new Set(),registered=parties.filter(party=>Number.isSafeInteger(party?.id)&&allowed(party)&&!seen.has(party.id)&&seen.add(party.id)).map(party=>({id:'registered:'+party.id,registered:true,directoryParty:!!party.directoryParty,recentShippingParty:!!party.recentShippingParty,businessNumber:party.businessNumber||'',partyId:party.id,label:party.name,code:party.code||'',country:party.country||'',searchNames:[party.nameKo,party.nameVi],data:Object.fromEntries(['name','address','contactName','phone','email','country'].map(key=>[key,party[key]||'']))}));
 const saved=presets.filter(row=>!fixedPartyId||row.partyId===fixedPartyId).filter(row=>row.partyId==null||allowed(parties.find(party=>party.id===row.partyId)||{id:row.partyId})).map(row=>({...row,registered:false,businessNumber:parties.find(party=>party.id===row.partyId)?.businessNumber||'',code:parties.find(party=>party.id===row.partyId)?.code||'',country:row.data?.country||parties.find(party=>party.id===row.partyId)?.country||''}));
 return [...registered,...saved];
}
export const shippingPartySourceText={
 ko:{registered:'등록 거래처',saved:'저장 주소록',code:'업체 코드',businessNumber:'사업자번호',directory:'검색 업체',recent:'이전에 사용한 운송 당사자',search:'업체명·사업자번호 검색',failed:'업체를 불러오지 못했습니다.'},
 en:{registered:'Registered partner',saved:'Saved address book',code:'Company code',businessNumber:'Business registration number',directory:'Company search',recent:'Previously used shipping party',search:'Search company name or business registration number',failed:'Could not load companies.'},
 vi:{registered:'Đối tác đã đăng ký',saved:'Sổ địa chỉ đã lưu',code:'Mã công ty',businessNumber:'Mã số doanh nghiệp',directory:'Tìm doanh nghiệp',recent:'Bên vận chuyển đã sử dụng',search:'Tìm tên hoặc mã số doanh nghiệp',failed:'Không thể tải doanh nghiệp.'},
};
export const shippingPartyConflictText={ko:'쉬퍼와 컨사이니는 서로 다른 업체를 선택해 주세요.',en:'Select different companies for shipper and consignee.',vi:'Vui lòng chọn công ty khác nhau cho người gửi và người nhận.'};
