import {setTextAcronyms} from './humanTextCase.mjs';

let loadedAt=0,pending=null;
export function applyTextAcronyms(value){setTextAcronyms(value.entries);loadedAt=Date.now();}
export async function loadTextAcronyms(base,{force=false}={}){
 if(!force&&Date.now()-loadedAt<30_000)return;
 if(!pending)pending=(async()=>{
  const response=await fetch(`${base}/text-acronyms`,{cache:'no-store',signal:AbortSignal.timeout(15_000)});
  if(!response.ok)throw Error('TEXT_ACRONYMS_LOAD_FAILED');
  const value=await response.json();
  if(!Number.isSafeInteger(value.revision)||!Array.isArray(value.entries)||value.entries.some(row=>typeof row.acronym!=='string'))throw Error('TEXT_ACRONYMS_LOAD_FAILED');
  applyTextAcronyms(value);
 })().finally(()=>{pending=null;});
 await pending;
}
