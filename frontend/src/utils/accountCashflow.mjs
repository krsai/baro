import {convertAccountBalances} from './accountBalanceConversion.mjs';
const scaled=value=>{const [whole,fraction='']=String(value).split('.');return BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'))*(String(value).startsWith('-')?-1n:1n);};
const money=(value,code)=>{const negative=value<0n,raw=String(negative?-value:value).padStart(5,'0');return (negative?'-':'')+raw.slice(0,-4)+(code==='USD'?'.'+raw.slice(-4,-2):'');};
export function accountCashflowItems(groups,accountId,target,rates){
 const items=new Map();
 for(const group of groups||[]){
  const entries=group.entries.filter(row=>!accountId||row.accountId===accountId);if(!entries.length)continue;
  const item=items.get(group.itemKey)||{itemKey:group.itemKey,code:group.code,nameKo:group.nameKo,nameEn:group.nameEn,nameVi:group.nameVi,entries:[],native:[]};
  item.entries.push(...entries);const total=entries.reduce((sum,row)=>sum+scaled(row.amount),0n),previous=item.native.find(row=>row.direction===group.direction&&row.currencyCode===group.currencyCode);
  if(previous)previous.balance=money(scaled(previous.balance)+total,group.currencyCode);else item.native.push({direction:group.direction,currencyCode:group.currencyCode,balance:money(total,group.currencyCode)});items.set(group.itemKey,item);
 }
 return [...items.values()].map(item=>({...item,in:convertAccountBalances(item.native.filter(row=>row.direction==='IN'),target,rates),out:convertAccountBalances(item.native.filter(row=>row.direction==='OUT'),target,rates),net:convertAccountBalances(item.native.map(row=>({...row,balance:row.direction==='OUT'?'-'+row.balance:row.balance})),target,rates)})).sort((a,b)=>a.code.localeCompare(b.code)||a.itemKey.localeCompare(b.itemKey));
}
export function accountCashflowTotal(items,direction,target,rates){return convertAccountBalances(items.flatMap(item=>item.native.filter(row=>row.direction===direction)),target,rates);}
export function accountCashflowNet(items,target,rates){
 const incoming=accountCashflowTotal(items,'IN',target,rates),outgoing=accountCashflowTotal(items,'OUT',target,rates);
 return incoming===null||outgoing===null?null:money(scaled(incoming)-scaled(outgoing),target);
}
export function categorizeCashflow(groups,labels){
 return (groups||[]).map(group=>{
  if(!Array.isArray(group.industries)||group.itemKey==='UNCODED')return group;
  const roles=new Map(group.industries.filter(industry=>industry.partnerRole).map(industry=>[industry.partnerRole.id,industry.partnerRole]));
  const role=roles.size===1?[...roles.values()][0]:null;
  const category=role||labels.unclassified;
  return {...group,...category,code:'',itemKey:role?`ROLE:${role.id}`:'UNCLASSIFIED',sourceIndustry:group.industries.length===1?group.industries[0]:labels.unclassified};
 });
}
export function cashflowSegments(items,direction){
 const rows=items.filter(row=>row[direction]!=null&&scaled(row[direction])>0n),total=rows.reduce((sum,row)=>sum+scaled(row[direction]),0n);let angle=-Math.PI/2;
 return rows.map((row,index)=>{const start=angle,ratio=Number(scaled(row[direction])*1000000000n/total)/1000000000;angle=index===rows.length-1?Math.PI*1.5:angle+ratio*Math.PI*2;return {...row,start,end:angle,ratio};});
}
const colors=['#2878f0','#22a699','#e6a23c','#9165cf','#e37676','#4998ad','#9aaf39','#a77c58'];
export function cashflowColor(key){let hash=0;for(const char of key)hash=(hash*31+char.charCodeAt(0))>>>0;return colors[hash%colors.length];}
