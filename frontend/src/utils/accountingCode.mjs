const localizedName=(row,language)=>row?.[{ko:'nameKo',en:'nameEn',vi:'nameVi'}[language]||'nameEn']||row?.nameEn||'';
export function isInternalFundsCode(code){
 const sources=[code?.serviceType,code?.serviceType?.systemDefault,code?.base?.serviceType,code?.base?.expenseType,...(code?.industries||[]),...(code?.base?.industries||[]),...(code?.base?.industryLinks||[]).map(link=>link.industry)];
 return sources.some(source=>source?.code==='FUNDS');
}
export function accountingCodeDescription(code,language='ko'){
 if(!code)return '';
 return localizedName(code.base,language)||localizedName(code,language);
}
