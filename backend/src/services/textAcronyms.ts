import {createHash} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {defaultTextAcronyms,normalizeTextAcronymEntry} from '../utils/textAcronyms';
import {setTextAcronyms} from '../utils/humanTextCase';

export const TEXT_ACRONYMS_KEY='TEXT_ACRONYMS:1';
export type TextAcronym={acronym:string;expansion:string;meaning:string;meaningKo:string;meaningEn:string;meaningVi:string};
export async function readTextAcronyms(db:any){
 const row=await db.systemSetting.findUnique({where:{key:TEXT_ACRONYMS_KEY}});
 return {revision:row?.value?.revision??0,meaningLanguagesVersion:1,entries:(row?.value?.entries??defaultTextAcronyms).map((entry:any)=>normalizeTextAcronymEntry(entry,row?.value?.meaningLanguagesVersion!==1))};
}
export function validateTextAcronyms(input:any):TextAcronym[]{
 const fail=():never=>{throw createHttpError(400,'INVALID_TEXT_ACRONYMS');};
 if(!Number.isSafeInteger(input?.revision)||input.revision<0||typeof input.clientKey!=='string'||!/^[\w-]{8,80}$/.test(input.clientKey)||!Array.isArray(input.entries)||input.entries.length>2000)fail();
 const seen=new Set<string>();
 return input.entries.map((row:any)=>{
  if(!row||typeof row.acronym!=='string'||typeof row.expansion!=='string'||typeof (row.meaningKo??row.meaning)!=='string'||['meaningKo','meaningEn','meaningVi'].some(key=>row[key]!==undefined&&typeof row[key]!=='string'))return fail();
  const acronym=row.acronym.trim(),expansion=row.expansion.trim(),meaningKo=(row.meaningKo??row.meaning).trim(),meaningEn=(row.meaningEn??'').trim(),meaningVi=(row.meaningVi??'').trim(),meaning=meaningKo,key=acronym.toUpperCase();
  // One lexical token, or slash-separated tokens, matching the normalizer.
  if(!/^[A-Za-z][A-Za-z0-9]*(?:\/[A-Za-z][A-Za-z0-9]*)*$/.test(acronym)||acronym.length>40||(acronym.match(/[A-Z]/g)||[]).length<2||expansion.length>500||[meaningKo,meaningEn,meaningVi].some(value=>value.length>500)||seen.has(key))return fail();
  seen.add(key);return {acronym,expansion,meaning,meaningKo,meaningEn,meaningVi};
 }).sort((a:TextAcronym,b:TextAcronym)=>a.acronym.localeCompare(b.acronym,'en'));
}
export async function saveTextAcronyms(db:any,input:any,email:string){
 const entries=validateTextAcronyms(input),providedFields=entries.map(entry=>{const raw=input.entries.find((row:any)=>row.acronym.trim().toUpperCase()===entry.acronym.toUpperCase());return ['meaningKo','meaningEn','meaningVi'].filter(key=>Object.hasOwn(raw,key));}),hash=createHash('sha256').update(JSON.stringify({entries,providedFields})).digest('hex');
 const legacyHash=providedFields.every(fields=>fields.length===0)?createHash('sha256').update(JSON.stringify(entries.map(({acronym,expansion,meaning})=>({acronym,expansion,meaning})))).digest('hex'):null;
 const value=await retryEditTransaction(db,async(tx:any)=>{
  await tx.systemSetting.upsert({where:{key:TEXT_ACRONYMS_KEY},create:{key:TEXT_ACRONYMS_KEY,value:{revision:0,entries:defaultTextAcronyms}},update:{}});
  await tx.$queryRawUnsafe('SELECT key FROM "SystemSetting" WHERE key=$1 FOR UPDATE',TEXT_ACRONYMS_KEY);
  const current=await readTextAcronyms(tx);
  const receiptKey=`TEXT_ACRONYMS_AUDIT:${input.clientKey}`;
  const receipt=await tx.systemSetting.findUnique({where:{key:receiptKey}});
  if(receipt){
   if(receipt.value.hash!==hash&&receipt.value.hash!==legacyHash||receipt.value.baseRevision!==input.revision||receipt.value.actor!==email)throw createHttpError(409,'TEXT_ACRONYMS_RETRY_MISMATCH');
   return current;
  }
  if(current.revision!==input.revision)throw createHttpError(409,'TEXT_ACRONYMS_CHANGED');
  const savedEntries=entries.map((entry,index)=>{const previous=current.entries.find((row:any)=>row.acronym.toUpperCase()===entry.acronym.toUpperCase());return {...entry,...Object.fromEntries(['meaningEn','meaningVi'].filter(key=>!(providedFields[index]??[]).includes(key)).map(key=>[key,previous?.[key]??'']))};});
  const after={revision:current.revision+1,meaningLanguagesVersion:1,entries:savedEntries};
  await tx.systemSetting.create({data:{key:receiptKey,value:{baseRevision:input.revision,hash,actor:email,before:current,after},updatedBy:email}});
  await tx.systemSetting.update({where:{key:TEXT_ACRONYMS_KEY},data:{value:after,updatedBy:email}});
  return after;
 });
 // Refresh from the committed current value, including when retrying an old receipt.
 const current=await readTextAcronyms(db);setTextAcronyms(current.entries);
 return value;
}
export function createTextAcronymLoader(db:any){
 let loadedAt=0,pending:Promise<any>|null=null;
 return async(force=false)=>{
  if(!force&&Date.now()-loadedAt<30_000)return;
  if(!pending)pending=readTextAcronyms(db).then(value=>{setTextAcronyms(value.entries);loadedAt=Date.now();}).finally(()=>{pending=null;});
  await pending;
 };
}
export function registerTextAcronymRoutes(app:any,db:any,gates:any){
 // The dictionary contains global spelling and meanings only, no company data.
 app.get('/text-acronyms',async(_req:any,res:any)=>{res.set('Cache-Control','no-store');res.json(await readTextAcronyms(db));});
 app.get('/system/text-acronyms',async(req:any,res:any)=>{
  if(!await gates.requireSystemAdmin(req,res))return;
  res.set('Cache-Control','no-store');res.json(await readTextAcronyms(db));
 });
 app.put('/system/text-acronyms',async(req:any,res:any)=>{
  const actor=await gates.requireSystemAdmin(req,res);if(!actor)return;
  res.json(await saveTextAcronyms(db,req.body,actor.requesterEmail));
 });
}
