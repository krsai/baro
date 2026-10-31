// The former catch-all stays linked by its original ID until explicitly reclassified.
export function partnerIndustryLabel(row,language='ko'){
 if(row?.code==='GENERAL'||row?.systemDefault?.code==='GENERAL')return {ko:'확인',en:'Check',vi:'Kiểm tra'}[language]||'Check';
 return row?.[{ko:'nameKo',vi:'nameVi',en:'nameEn'}[language]||'nameEn']||row?.nameEn||'';
}
