const decimal=value=>{
 const text=String(value??'');if(!/^-?\d+(\.\d{1,12})?$/.test(text))return null;
 const negative=text.startsWith('-'),[whole,fraction='']=(negative?text.slice(1):text).split('.');
 return {n:BigInt(whole+fraction)*(negative?-1n:1n),d:10n**BigInt(fraction.length)};
};
const gcd=(a,b)=>{a=a<0n?-a:a;while(b){[a,b]=[b,a%b];}return a||1n;};
// USD-base reference rates; sum exact rational values before final display rounding.
export function convertAccountBalances(rows,target,rates={}){
 let n=0n,d=1n;
 for(const row of rows){
  const amount=decimal(row.balance??row.currentBalance);if(!amount)return null;
  if(amount.n===0n)continue;
  let a=amount.n,b=amount.d;
  if(row.currencyCode!==target){
   const source=decimal(rates[row.currencyCode]),quote=decimal(rates[target]);
   if(!source||!quote||source.n<=0n||quote.n<=0n)return null;
   a*=quote.n*source.d;b*=quote.d*source.n;
  }
  n=n*b+a*d;d*=b;const factor=gcd(n,d);n/=factor;d/=factor;
 }
 const digits=target==='USD'?2:0,scale=10n**BigInt(digits),negative=n<0n,absolute=(negative?-n:n)*scale;
 const units=absolute/d+(absolute%d*2n>=d?1n:0n),text=String(units).padStart(digits+1,'0');
 return (negative&&units!==0n?'-':'')+(digits?text.slice(0,-digits)+'.'+text.slice(-digits):text);
}
