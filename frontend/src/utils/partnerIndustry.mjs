// The former catch-all stays linked by its original ID until explicitly reclassified.
export function partnerIndustryLabel(row,language='ko'){
 if(row?.code==='GENERAL'||row?.systemDefault?.code==='GENERAL')return {ko:'기존 GENERAL 연결',en:'Existing GENERAL link',vi:'Liên kết GENERAL hiện có'}[language]||'Existing GENERAL link';
 return row?.[{ko:'nameKo',vi:'nameVi',en:'nameEn'}[language]||'nameEn']||row?.nameEn||'';
}
