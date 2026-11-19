export function requiredAccountingInputs(value){
 const result={...value};
 for(const key of ['orderInput','styleInput','processInput'])if(result[key]==='OPTIONAL')result[key]='REQUIRED';
 if(result.attributeInputs)result.attributeInputs=Object.fromEntries(Object.entries(result.attributeInputs).map(([key,mode])=>[key,mode==='OPTIONAL'?'REQUIRED':mode]));
 return result;
}
