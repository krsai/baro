import {createHash,randomUUID} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {freightForwarder} from './freightOperations';
import {assertShippingEnglish} from './shippingEnglish';
const fail=(code='SHIPPING_TRADE_DOCUMENT_INVALID',status=400):never=>{throw createHttpError(status,code);};
const text=(value:any,max:number,required=false)=>{if(typeof value!=='string'||value.length>max||required&&!value.trim())fail();return value.trim();};
const decimal=(value:any,positive=false)=>{if(typeof value!=='string'||!/^\d{1,16}(?:\.\d{1,4})?$/.test(value)||positive&&!/[1-9]/.test(value))fail();return value;};
const units=(value:string)=>{const [whole='0',fraction='']=value.split('.');return BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));};
const date=(value:any)=>{const d=text(value,10,true);if(!/^\d{4}-\d\d-\d\d$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)fail();return d;};
const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
function party(value:any){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['name','taxId','address','contactName','phone','email'].includes(key)))fail();
 const result=Object.fromEntries(['name','taxId','address','contactName','phone','email'].map(key=>[key,text(value[key]||'',key==='address'?1000:320,['name','address'].includes(key))]));
 assertShippingEnglish(result);return result;
}
function form(kind:string,value:any){
 const allowed=['number','date','seller','buyer','currencyCode','incoterms','paymentTerms','remarks','lines'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key))||!Array.isArray(value.lines)||!value.lines.length||value.lines.length>200)fail();
 const lines=value.lines.map((line:any)=>{
  const keys=kind==='COMMERCIAL_INVOICE'?['description','hsCode','origin','quantity','unit','unitPrice']:['description','marks','packages','quantity','unit','netWeightKg','grossWeightKg','cbm'];
  if(!line||Object.keys(line).some(key=>!keys.includes(key)))fail();
  const out:any={description:text(line.description,500,true),quantity:decimal(line.quantity,true),unit:text(line.unit,30,true)};
  for(const key of keys.filter(key=>!['description','quantity','unit'].includes(key)))out[key]=['unitPrice','packages','netWeightKg','grossWeightKg','cbm'].includes(key)?decimal(line[key]):text(line[key]||'',200);
  if(kind==='PACKING_LIST'&&(units(out.grossWeightKg)<units(out.netWeightKg)||!/^\d{1,8}$/.test(out.packages)||Number(out.packages)<1))fail();
  return out;
 });
 const result:any={number:text(value.number,120,true),date:date(value.date),seller:party(value.seller),buyer:party(value.buyer),incoterms:text(value.incoterms||'',100),paymentTerms:text(value.paymentTerms||'',500),remarks:text(value.remarks||'',2000),lines};
 if(kind==='COMMERCIAL_INVOICE'){
  result.currencyCode=text(value.currencyCode,3,true);const digits=result.currencyCode==='USD'?2:0,divisor=10n**BigInt(8-digits);
  const amounts=lines.map((line:any)=>(units(line.quantity)*units(line.unitPrice)+divisor/2n)/divisor);
  const format=(amount:bigint)=>digits?`${amount/100n}.${String(amount%100n).padStart(2,'0')}`:String(amount);
  result.lines=lines.map((line:any,index:number)=>({...line,amount:format(amounts[index])}));result.total=format(amounts.reduce((a:bigint,b:bigint)=>a+b,0n));
 }else{
  const four=(value:bigint)=>`${value/10000n}.${String(value%10000n).padStart(4,'0')}`;
  result.totals={packages:lines.reduce((sum:bigint,line:any)=>sum+BigInt(line.packages),0n).toString(),...Object.fromEntries(['netWeightKg','grossWeightKg','cbm'].map(key=>[key,four(lines.reduce((sum:bigint,line:any)=>sum+units(line[key]),0n))]))};
 }
 return result;
}
function file(value:any){
 if(!value||Object.keys(value).some(key=>!['name','mimeType','base64'].includes(key)))fail();
 const name=text(value.name,200,true),mimeType=text(value.mimeType,120,true),base64=text(value.base64,2796204,true);
 if(/[\x00-\x1f\\/]/.test(name)||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))fail();
 const bytes=Buffer.from(base64,'base64');if(!bytes.length||bytes.length>2*1024*1024||bytes.toString('base64')!==base64)fail();
 const extension=name.split('.').pop()?.toLowerCase(),hex=bytes.subarray(0,8).toString('hex');
 const valid=extension==='pdf'&&mimeType==='application/pdf'&&bytes.subarray(0,5).toString()==='%PDF-'||extension==='png'&&mimeType==='image/png'&&hex==='89504e470d0a1a0a'||['jpg','jpeg'].includes(extension||'')&&mimeType==='image/jpeg'&&hex.startsWith('ffd8ff')||['xlsx','docx'].includes(extension||'')&&['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(mimeType)&&hex.startsWith('504b0304')||extension==='xls'&&mimeType==='application/vnd.ms-excel'&&hex==='d0cf11e0a1b11ae1';
 if(!valid)fail();return {name,mimeType,base64,byteLength:bytes.length,sha256:digest(bytes)};
}
export async function saveShippingTradeDocument(db:any,orgId:number,actorId:number,jobId:string,input:any){
 await freightForwarder(db,orgId,actorId);
 if(!input||Object.keys(input).some(key=>!['clientKey','version','kind','sourceMode','fields','file'].includes(key))||typeof input.clientKey!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(input.clientKey)||!Number.isSafeInteger(input.version)||!['COMMERCIAL_INVOICE','PACKING_LIST'].includes(input.kind)||!['FILE','FORM'].includes(input.sourceMode)||input.sourceMode==='FILE'&&input.fields!==undefined||input.sourceMode==='FORM'&&input.file!==undefined)fail();
 const tradeDocument=input.sourceMode==='FILE'?{sourceMode:'FILE',file:file(input.file)}:{sourceMode:'FORM',fields:form(input.kind,input.fields)};
 const requestHash=digest(JSON.stringify({version:input.version,kind:input.kind,tradeDocument}));
 return retryEditTransaction(db,async(tx:any)=>{
  await freightForwarder(tx,orgId,actorId);await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))::text',`freight-document:${orgId}:${input.clientKey}`);
  const row=(await tx.$queryRawUnsafe('SELECT * FROM "FreightJob" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',jobId,orgId))[0];if(!row)fail('FREIGHT_NOT_FOUND',404);
  if(row.receiptStatus!=='ACCEPTED'||row.status==='CANCELLED')fail('SHIPPING_NOT_ACCEPTED',409);
  const previous=(await tx.$queryRawUnsafe('SELECT * FROM "FreightDocument" WHERE "orgId"=$1 AND "clientKey"=$2',orgId,input.clientKey))[0];
  if(previous){if(previous.jobId!==jobId||previous.snapshot.requestHash!==requestHash)fail('FREIGHT_KEY_CONFLICT',409);return previous;}
  if(row.version!==input.version)fail('FREIGHT_CHANGED',409);
  if(input.sourceMode==='FORM'&&input.kind==='COMMERCIAL_INVOICE'&&!await tx.currency.findUnique({where:{code:(tradeDocument as any).fields.currencyCode},select:{id:true}}))fail();
  const id=randomUUID(),number=input.sourceMode==='FORM'?(tradeDocument as any).fields.number:(tradeDocument as any).file.name;
  // These are immutable customer originals or authored review copies, not ledger invoices.
  const snapshot={layout:'trade-v1',requestHash,tradeDocument,source:{id:jobId,number:row.number,version:row.version},createdByEmployeeId:actorId,draft:input.sourceMode==='FORM'};
  return (await tx.$queryRawUnsafe('INSERT INTO "FreightDocument"(id,"orgId","jobId","clientKey",kind,number,"sourceVersion",snapshot,"createdByEmployeeId") VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING *',id,orgId,jobId,input.clientKey,input.kind,number,row.version,JSON.stringify(snapshot),actorId))[0];
 });
}
