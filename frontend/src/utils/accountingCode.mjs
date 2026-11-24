const localizedName=(row,language)=>row?.[{ko:'nameKo',en:'nameEn',vi:'nameVi'}[language]||'nameEn']||row?.nameEn||'';
export function isInternalFundsCode(code){
 const sources=(code?.base?.industryLinks||[]).map(link=>link.industry);
 return sources.some(source=>source?.code==='FUNDS'||['FINANCE','FUNDS'].includes(source?.partnerRole?.code));
}
export function accountingCodeDescription(code,language='ko'){
 if(!code)return '';
 return localizedName(code.base,language)||localizedName(code,language);
}
