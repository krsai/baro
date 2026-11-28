import {createHash} from 'node:crypto';
import {createHttpError} from '../utils/http';

export const EVIDENCE_MAX_BYTES=5*1024*1024;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
export const attachmentPath=(id:string,fileName:string)=>`/nas-evidence/${id}/${encodeURIComponent(fileName)}`;
export function evidenceStorageConfig(orgId:number,env:NodeJS.ProcessEnv=process.env){
 let all:any;try{all=JSON.parse(env.EVIDENCE_NAS_COMPANIES_JSON||'{}');}catch{return fail('EVIDENCE_STORAGE_CONFIG',503);}
 if(!all||typeof all!=='object'||Array.isArray(all))return fail('EVIDENCE_STORAGE_CONFIG',503);
 const selected=all[String(orgId)];if(!selected)return null;
 const validated=Object.entries(all).map(([key,value]:[string,any])=>{
  let url:URL;try{url=new URL(value.baseUrl);}catch{return fail('EVIDENCE_STORAGE_CONFIG',503);}
  if(!/^[1-9]\d*$/.test(key)||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/')||url.pathname==='/'||!value.username||!value.password)return fail('EVIDENCE_STORAGE_CONFIG',503);
  return {orgId:Number(key),baseUrl:url.href,username:String(value.username),password:String(value.password)};
 });
 for(const a of validated)for(const b of validated)if(a.orgId!==b.orgId&&(a.baseUrl.startsWith(b.baseUrl)||b.baseUrl.startsWith(a.baseUrl)||a.username===b.username))fail('EVIDENCE_STORAGE_CONFIG',503);
 return validated.find(row=>row.orgId===orgId)!;
}
export function evidenceUploadInput(input:any){
 if(!uuid.test(input?.clientKey||'')||typeof input.fileName!=='string'||!input.fileName.trim()||input.fileName.length>180||/[\\/\u0000-\u001f\u007f]/.test(input.fileName)||['.','..'].includes(input.fileName)||attachmentPath(input.clientKey,input.fileName).length>500)fail('EVIDENCE_FILE_INVALID');
 const name=input.fileName,extension=name.split('.').pop()?.toLowerCase();
 const types:Record<string,string>={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
 if(!extension||!types[extension])fail('EVIDENCE_FILE_TYPE');
 const raw=input.contentBase64;
 if(typeof raw!=='string'||!raw.length||raw.length>Math.ceil(EVIDENCE_MAX_BYTES/3)*4||raw.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(raw))fail('EVIDENCE_FILE_SIZE');
 const bytes=Buffer.from(raw,'base64');if(!bytes.length||bytes.length>EVIDENCE_MAX_BYTES||bytes.toString('base64')!==raw)fail('EVIDENCE_FILE_SIZE');
 const matches=extension==='pdf'?bytes.subarray(0,5).toString()==='%PDF-':extension==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):extension==='webp'?bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP':bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(!matches)fail('EVIDENCE_FILE_TYPE');
 return {id:input.clientKey.toLowerCase(),fileName:name,extension,contentType:types[extension],byteSize:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),bytes};
}
export function attachmentEvidence(row:any){return {path:attachmentPath(row.id,row.originalFileName),reference:''};}
// The endpoint and credentials are server configuration; no request may supply a NAS URL.
export function webdavEvidenceStore(config:NonNullable<ReturnType<typeof evidenceStorageConfig>>,fetcher:typeof fetch=fetch){
 const request=async(key:string,method:string,bytes?:Buffer)=>{
  if(!/^\d{4}\/\d{2}\/[a-f0-9-]+\.(pdf|png|jpe?g|webp)$/.test(key))fail('EVIDENCE_FILE_INVALID');
  try{return await fetcher(new URL(key,config.baseUrl),{method,headers:{Authorization:'Basic '+Buffer.from(config.username+':'+config.password).toString('base64'),...(method==='PUT'?{'If-None-Match':'*','Content-Type':'application/octet-stream'}:{})},body:bytes as any,redirect:'error',signal:AbortSignal.timeout(25000)});}catch{return fail('EVIDENCE_STORAGE_UNAVAILABLE',503);}
 };
 const read=async(key:string)=>{
  const response=await request(key,'GET');if(!response.ok)fail('EVIDENCE_STORAGE_UNAVAILABLE',503);
  if(Number(response.headers.get('content-length'))>EVIDENCE_MAX_BYTES)fail('EVIDENCE_STORAGE_UNAVAILABLE',503);
  const reader=response.body?.getReader();if(!reader)fail('EVIDENCE_STORAGE_UNAVAILABLE',503);
  const chunks:Buffer[]=[];let size=0;
  try{while(true){const item=await reader!.read();if(item.done)break;size+=item.value.length;if(size>EVIDENCE_MAX_BYTES){await reader!.cancel();fail('EVIDENCE_STORAGE_UNAVAILABLE',503);}chunks.push(Buffer.from(item.value));}}catch{return fail('EVIDENCE_STORAGE_UNAVAILABLE',503);}
  return Buffer.concat(chunks);
 };
 return {read,async write(key:string,bytes:Buffer){
  // Create only the server-generated year/month folders. Existing collections return 405.
  const parts=key.split('/');for(let i=1;i<3;i++){
   let r:Response;try{r=await fetcher(new URL(parts.slice(0,i).join('/')+'/',config.baseUrl),{method:'MKCOL',headers:{Authorization:'Basic '+Buffer.from(config.username+':'+config.password).toString('base64')},redirect:'error',signal:AbortSignal.timeout(10000)});}catch{return fail('EVIDENCE_STORAGE_UNAVAILABLE',503);}
   if(!r.ok&&r.status!==405)fail('EVIDENCE_STORAGE_UNAVAILABLE',503);
  }
  const response=await request(key,'PUT',bytes);if(!response.ok&&response.status!==412)fail('EVIDENCE_STORAGE_UNAVAILABLE',503);
  // Verify actual bytes, including after an uncertain or concurrent PUT retry.
  const saved=await read(key);if(!saved.equals(bytes))fail('EVIDENCE_STORAGE_MISMATCH',409);
 }};
}
export async function uploadEvidence(db:any,scope:{orgId:number,actorId:number,purpose:string},input:any,storeFactory=webdavEvidenceStore,env:NodeJS.ProcessEnv=process.env){
 const config=evidenceStorageConfig(scope.orgId,env);if(!config)fail('EVIDENCE_STORAGE_NOT_CONFIGURED',503);
 const file=evidenceUploadInput(input);
 const {orgId,actorId,purpose}=scope;
 if(!['EXPENSE','BANK_LEDGER','WORK_REPORT'].includes(purpose))fail('EVIDENCE_FILE_INVALID');
 const employee=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE'}});if(!employee)fail('ACTIVE_EMPLOYEE_REQUIRED',403);
 const createdAt=new Date(),year=createdAt.getUTCFullYear(),month=String(createdAt.getUTCMonth()+1).padStart(2,'0');
 await db.evidenceAttachment.upsert({where:{id:file.id},create:{id:file.id,orgId,createdByEmployeeId:actorId,purpose,originalFileName:file.fileName,contentType:file.contentType,byteSize:file.byteSize,sha256:file.sha256,storageRoot:config!.baseUrl,storageKey:`${year}/${month}/${file.id}.${file.extension}`,createdAt},update:{}});
 let row=await db.evidenceAttachment.findUnique({where:{id:file.id}});
 if(row.orgId!==orgId||row.createdByEmployeeId!==actorId||row.purpose!==purpose||row.originalFileName!==file.fileName||row.sha256!==file.sha256||row.storageRoot!==config!.baseUrl)fail('EVIDENCE_UPLOAD_RETRY_MISMATCH',409);
 if(row.status!=='READY'){
  await storeFactory(config!).write(row.storageKey,file.bytes);
  // Recheck employment after the network request; incomplete uploads never become evidence.
  if(!await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE'}}))fail('ACTIVE_EMPLOYEE_REQUIRED',403);
  await db.evidenceAttachment.updateMany({where:{id:row.id,orgId,status:'PENDING'},data:{status:'READY',readyAt:new Date()}});
  row=await db.evidenceAttachment.findUnique({where:{id:row.id}});
 }
 return attachmentEvidence(row);
}
