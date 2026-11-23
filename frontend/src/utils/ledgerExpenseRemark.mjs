// Copy only the company-scoped expense document selected by its actual ID.
// Preserve manual additions; saved ledger history never follows later source edits.
export function appendExpenseRemark(current,document){
 const source=typeof document?.remark==='string'?document.remark.trim():'';
 if(!source)return current;
 const text=String(current||'');
 if(text.trim()===source||('\n\n'+text+'\n\n').includes('\n\n'+source+'\n\n'))return text;
 return text.trim()?text+'\n\n'+source:source;
}
