import {textFieldCase,titleCaseWords} from './humanTextCase.mjs';

// Display-only formatting for typed list/detail fields. Ambiguous "name"
// columns can contain companies, so they require an explicit person contract.
export function humanTextDisplay(value,{key='',label='',textCase}={}){
 if(textCase==='upper'&&typeof value==='string')return value.toUpperCase();
 if(typeof value!=='string'||textCase==='preserve')return value;
 const human=/^(contactName|representative|employeeName|recipientName|driver|designer|address|addressEn|companyAddress|pickupAddress|deliveryAddress|description|remark|remarks|memo|note|notes)$/i.test(key);
 const person=/employee name|contact person|representative|직원명|담당자|대표자|người liên hệ|người đại diện/i.test(label);
 return textCase==='title'||(human||person)&&textFieldCase({name:key,label})==='title'?titleCaseWords(value):value;
}
