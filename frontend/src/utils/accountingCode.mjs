const localizedName=(row,language)=>row?.[{ko:'nameKo',en:'nameEn',vi:'nameVi'}[language]||'nameEn']||row?.nameEn||'';
export function accountingCodeDescription(code,language='ko'){
 if(!code)return '';
 return [localizedName(code.base?.expenseType,language),localizedName(code.base,language)||localizedName(code,language)].filter(Boolean).join(' - ');
}
