type Snapshot={source:string;sourceUrl:string;date:string;rates:Record<string,string>;stale:boolean};
// Public reference rates only. Company/account information never leaves the server.
export function createReferenceRateLoader(fetcher:typeof fetch=fetch,now=()=>Date.now()){
 let cache:{at:number;value:Snapshot}|undefined,pending:Promise<Snapshot>|undefined,retryAfter=0;
 return async function load():Promise<Snapshot>{
  const time=now();
  if(cache&&time-cache.at<6*60*60*1000)return cache.value;
  if(time<retryAfter){if(cache&&time-cache.at<48*60*60*1000)return {...cache.value,stale:true};throw new Error('EXCHANGE_RATES_UNAVAILABLE');}
  if(pending)return pending;
  pending=(async()=>{
   try{
    const response=await fetcher('https://api.frankfurter.dev/v2/rates?base=USD&quotes=VND,KRW',{signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error('EXCHANGE_RATES_UNAVAILABLE');
    const rows=await response.json() as any[];
    if(!Array.isArray(rows))throw new Error('EXCHANGE_RATES_UNAVAILABLE');
    const rates:Record<string,string>={USD:'1'},dates:string[]=[];
    for(const quote of ['VND','KRW']){
     const matches=rows.filter(row=>row.base==='USD'&&row.quote===quote);
     const row=matches[0],rate=String(row?.rate??'');
     if(matches.length!==1||!/^\d+(\.\d{1,12})?$/.test(rate)||!Number.isFinite(Number(rate))||Number(rate)<=0||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(Date.parse(row.date))||Date.parse(row.date)>time+86400000||time-Date.parse(row.date)>7*86400000)throw new Error('EXCHANGE_RATES_UNAVAILABLE');
     rates[quote]=rate;dates.push(row.date);
    }
    const value:Snapshot={source:'Frankfurter',sourceUrl:'https://frankfurter.dev/',date:dates.sort()[0]!,rates,stale:false};
    cache={at:time,value};retryAfter=0;return value;
   }catch(error){retryAfter=time+60000;if(cache&&time-cache.at<48*60*60*1000)return {...cache.value,stale:true};throw new Error('EXCHANGE_RATES_UNAVAILABLE');}
   finally{pending=undefined;}
  })();
  return pending;
 };
}
export const loadReferenceExchangeRates=createReferenceRateLoader();
