export const emptyPartnerClassification=()=>({revision:0,roleIds:[],industryIds:[],industries:[]});
export const classificationPayload=value=>({revision:value?.revision??0,roleIds:value?.roleIds||[],industryIds:value?.industryIds||[]});
export function classificationComplete(value){
 return Boolean(value?.roleIds?.length&&value?.industryIds?.length&&value.roleIds.every(id=>value.industries?.some(row=>row.partnerRoleId===id&&value.industryIds.includes(row.id)))&&value.industryIds.every(id=>value.industries?.some(row=>row.id===id&&row.code!=='GENERAL'&&value.roleIds.includes(row.partnerRoleId))));
}
export const classificationName=(row,language='ko')=>row?.[{ko:'nameKo',vi:'nameVi',en:'nameEn'}[language]||'nameEn']||row?.nameEn||row?.code||'';
export function classificationSummary(value,language='ko'){
 return (value?.roleIds||[]).map(roleId=>{
  const industries=(value.industries||[]).filter(row=>row.partnerRoleId===roleId&&value.industryIds.includes(row.id));
  return [classificationName(industries[0]?.partnerRole,language),industries.map(row=>classificationName(row,language)).join(', ')].filter(Boolean).join(' > ');
 }).filter(Boolean).join(' · ');
}
export const PARTNER_CLASSIFICATION_TEXT={
 ko:{category:'구분',industry:'세부 업종',required:'구분과 각 구분의 세부 업종을 하나 이상 선택하세요.',loadError:'거래처 분류를 불러오지 못했습니다.',retry:'다시 조회',changed:'다른 사용자가 거래처 분류를 변경했습니다. 다시 조회한 후 저장하세요.'},
 en:{category:'Category',industry:'Industry',required:'Select at least one category and a industry for each selected category.',loadError:'Could not load partner classifications.',retry:'Retry',changed:'Partner classifications changed. Reload before saving.'},
 vi:{category:'Nhóm',industry:'Ngành nghề',required:'Chọn ít nhất một nhóm và một ngành nghề cho mỗi nhóm đã chọn.',loadError:'Không thể tải phân loại đối tác.',retry:'Tải lại',changed:'Phân loại đối tác đã thay đổi. Tải lại trước khi lưu.'},
};
