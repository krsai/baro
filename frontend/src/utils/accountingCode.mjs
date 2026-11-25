const localizedName=(row,language)=>row?.[{ko:'nameKo',en:'nameEn',vi:'nameVi'}[language]||'nameEn']||row?.nameEn||'';
export function isInternalFundsCode(code){
 const sources=(code?.base?.industryLinks||[]).map(link=>link.industry);
 return sources.some(source=>source?.code==='FUNDS'||['FINANCE','FUNDS'].includes(source?.partnerRole?.code));
}
export function accountingCodeDescription(code,language='ko'){
 if(!code)return '';
 return localizedName(code.base,language)||localizedName(code,language);
}
// Search every stored language, including the base names used for display.
// Keep tax variants as distinct options; matching a name never merges their IDs.
export function accountingCodeSearchValues(code){
 return [...new Set([code?.code,...[code,code?.base].flatMap(row=>[row?.nameKo,row?.nameEn,row?.nameVi])].filter(Boolean))];
}
