import {parseVolumeInput} from './volumeFormula.mjs';

// Review only: addition groups are hints, never proof of package count or a multiplier.
export function reviewVolumeFormula(formula,quantity){
 const count=Number(quantity);
 if(!Number.isSafeInteger(count)||count<2||typeof formula!=='string'||!formula.trim().startsWith('=')||!parseVolumeInput(formula))return null;
 let source=formula.trim().slice(1).replace(/\s/g,'');
 while(source.startsWith('(')&&source.endsWith(')')){
  let depth=0,whole=true;
  for(let i=0;i<source.length-1;i++){if(source[i]==='(')depth++;else if(source[i]===')')depth--;if(depth===0){whole=false;break;}}
  if(!whole)break;source=source.slice(1,-1);
 }
 let depth=0,terms=1;
 for(let i=0;i<source.length;i++){
  if(source[i]==='(')depth++;else if(source[i]===')')depth--;
  else if(depth===0&&source[i]==='+'&&i>0&&!'+-*/('.includes(source[i-1]))terms++;
 }
 return terms<count?{quantity:count,terms}:null;
}
