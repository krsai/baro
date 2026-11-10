export const normalizeLookupText = value => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[đĐ]/g,'d').toLocaleLowerCase().trim();
export function exactLookupCode(options, input) {
  const code = String(input ?? '').trim().toUpperCase();
  const matches = code ? options.filter(option => String(option.code ?? '').toUpperCase() === code) : [];
  return matches.length === 1 ? matches[0] : null;
}
export function resolveLookupOption(options,input,{getLabel=row=>row.name||row.code||'',getCode=row=>row.code||row.employeeNo||'',getValues=row=>[row.name,row.nameKo,row.nameVi]}={}){
 const query=normalizeLookupText(input);if(!query)return null;
 const code=options.filter(row=>normalizeLookupText(getCode(row))===query);
 if(code.length)return code.length===1?code[0]:null;
 const exact=options.filter(row=>[getLabel(row),...getValues(row)].some(value=>value&&normalizeLookupText(value)===query));
 if(exact.length)return exact.length===1?exact[0]:null;
 // A single partial search result still requires explicit selection in the dialog.
 return null;
}
