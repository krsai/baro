import {validEvidencePath,evidenceReference} from '../utils/evidencePath';
import {createHttpError} from '../utils/http';

export function evidenceDisplayFilename(value:unknown){
 const path=String(value||'');
 if(/^\/nas-evidence\/[a-f0-9-]{36}\//i.test(path)){
  try{return decodeURIComponent(path.split('/').slice(3).join('/'));}catch{/* Preserve malformed historical text. */}
 }
 return path.split(/[\\/]/).pop()||'';
}

export function storedDocumentEvidence(document:any,legacy:any[]=[]):any[]{
 if(Array.isArray(document?.evidenceFiles))return document.evidenceFiles;
 const values=legacy.map(item=>({path:item?.details?.evidenceFile||item?.evidenceNumber||'',reference:item?.details?.reference||''})).filter(item=>item.path&&!item.path.startsWith('IBT:'));
 return [...new Map(values.map(item=>[JSON.stringify(item),item])).values()];
}
export function normalizeDocumentEvidence(value:any,previous:any[]=[]):any[]{
 if(!Array.isArray(value)||value.length>50)throw createHttpError(400,'LEDGER_FILE_REQUIRED');
 const retained=new Set(previous.map(item=>JSON.stringify({path:item.path,reference:item.reference||''})));
 const result=value.map(item=>{
  if(!item||typeof item.path!=='string'||typeof (item.reference??'')!=='string'||Object.keys(item).some(key=>!['path','reference'].includes(key)))throw createHttpError(400,'LEDGER_FILE_REQUIRED');
  const original={path:item.path,reference:item.reference||''};
  if(retained.has(JSON.stringify(original)))return original;
  const entry={path:evidenceReference(item.path).trim(),reference:(item.reference||'').trim()};
  const attachment=/^\/nas-evidence\/[a-f0-9-]{36}\/[^/]+$/.test(entry.path)&&entry.path.length<=500;
  if(entry.reference.length>500||/[\u0000-\u001f\u007f]/.test(entry.reference)||!attachment&&!validEvidencePath(entry.path)&&!retained.has(JSON.stringify(entry)))throw createHttpError(400,'LEDGER_FILE_REQUIRED');
  return entry;
 });
 if(new Set(result.map(item=>JSON.stringify(item))).size!==result.length)throw createHttpError(400,'LEDGER_FILE_REQUIRED');
 return result;
}
