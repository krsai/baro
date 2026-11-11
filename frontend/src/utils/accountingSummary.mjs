export function accountingSummary(values=[],languageCode='ko'){
 const items=values.filter(value=>value!=null&&String(value).trim());
 if(!items.length)return '—';
 if(items.length===1)return String(items[0]);
 const n=items.length-1;
 return languageCode==='vi'?`${items[0]} và ${n} mục khác`:languageCode==='en'?`${items[0]} + ${n} more`:`${items[0]} 외 ${n}건`;
}
