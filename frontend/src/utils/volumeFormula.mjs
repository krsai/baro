// Mirrored in backend/src/utils/volumeFormula.js. No eval, units or quantity inference.
export function parseVolumeInput(input){
 if(typeof input!=='string'||input.length>200)return null;
 const raw=input.trim();if(!raw)return {cbm:'',cbmFormula:''};
 const formula=raw.startsWith('=');
 if(!formula&&!/^\d{1,10}(?:\.\d{1,6})?$/.test(raw))return null;
 const source=(formula?raw.slice(1):raw).replace(/\s/g,'');
 if(!source||!/^[\d.+*/()\-]+$/.test(source))return null;
 let pos=0,depth=0,steps=0;
 const pair=(n,d=1n)=>{if(d===0n||n.toString().length>200||d.toString().length>200)throw Error();return [n,d];};
 const factor=()=>{
  if(++steps>100||++depth>16)throw Error();
  let result;
  if(source[pos]==='('){pos++;result=expression();if(source[pos++]!==')')throw Error();}
  else if(source[pos]==='+'||source[pos]==='-'){const sign=source[pos++];result=factor();if(sign==='-')result=[-result[0],result[1]];}
  else{const match=source.slice(pos).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);if(!match||match[0].length>24)throw Error();pos+=match[0].length;const [whole,fraction='']=match[0].split('.');result=pair(BigInt((whole||'0')+fraction),10n**BigInt(fraction.length));}
  depth--;return result;
 };
 const product=()=>{let a=factor();while(source[pos]==='*'||source[pos]==='/'){const op=source[pos++],b=factor();a=op==='*'?pair(a[0]*b[0],a[1]*b[1]):pair(a[0]*b[1],a[1]*b[0]);}return a;};
 const expression=()=>{let a=product();while(source[pos]==='+'||source[pos]==='-'){const op=source[pos++],b=product();a=pair(a[0]*b[1]+(op==='+'?1n:-1n)*b[0]*a[1],a[1]*b[1]);}return a;};
 try{
  let [n,d]=expression();if(pos!==source.length)return null;if(d<0n){n=-n;d=-d;}
  if(n<0n||n>=10000000000n*d)return null;
  const scaled=(n*1000000n+d/2n)/d;if(scaled>=10000000000n*1000000n)return null;
  const cbm=`${scaled/1000000n}.${String(scaled%1000000n).padStart(6,'0')}`.replace(/\.?0+$/,'');
  return {cbm,cbmFormula:formula?raw:''};
 }catch{return null;}
}
