import {createHash} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {companyIndustryMenuFeatures} from './industryMenuPolicy';
import {attachmentPath,evidenceStorageConfig,EVIDENCE_MAX_BYTES,uploadEvidence,webdavEvidenceStore} from './evidenceStorage';

export async function evidenceAttachmentActor(db:any,orgId:number,actorId:number,purpose:string,gates:any,orgType:string){
 const employee=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE'}});
 const feature=purpose==='EXPENSE'?'OUTSOURCING_RECORD':purpose==='BANK_LEDGER'?'BANK_LEDGER':purpose==='WORK_REPORT'?'DASHBOARD':'';
 if(!feature||!employee||!(purpose==='WORK_REPORT'?['ADMIN','ACCOUNTANT','OPERATOR','WORKER']:purpose==='BANK_LEDGER'?['ADMIN','ACCOUNTANT']:['ADMIN','ACCOUNTANT','OPERATOR']).includes(employee.orgRole))throw createHttpError(403,'EVIDENCE_ACCESS_DENIED');
 if(!await gates.canAccess({orgType,orgRole:employee.orgRole,feature})||!(await companyIndustryMenuFeatures(db,orgId,orgType)).includes(feature))throw createHttpError(403,'EVIDENCE_ACCESS_DENIED');
 return {orgId,actorId,purpose};
}
export function registerEvidenceAttachmentRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any,purpose:string)=>{
  const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','ACCOUNTANT','OPERATOR','WORKER'],allowSystemAdmin:false});if(!ctx)return null;
  return evidenceAttachmentActor(db,ctx.organization.id,gates.actorId(),purpose,gates,ctx.organization.type);
 };
 app.get('/evidence-attachments/status',async(req:any,res:any)=>{
  const scope=await access(req,res,String(req.query.purpose));if(!scope)return;
  res.setHeader('Cache-Control','no-store');res.json({configured:Boolean(evidenceStorageConfig(scope.orgId)),maxBytes:EVIDENCE_MAX_BYTES});
 });
 app.post('/evidence-attachments',async(req:any,res:any)=>{
  const scope=await access(req,res,String(req.query.purpose));if(!scope)return;
  res.setHeader('Cache-Control','no-store');res.json(await uploadEvidence(db,scope,req.body));
 });
 app.get('/evidence-attachments/:id/content',async(req:any,res:any)=>{
  // Resolve company membership before touching an attachment or its storage configuration.
  const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','ACCOUNTANT','OPERATOR','WORKER'],allowSystemAdmin:false});if(!ctx)return;
  const orgId=ctx.organization.id,actorId=gates.actorId();
  const viewer=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE'},select:{orgRole:true}});
  if(!viewer)throw createHttpError(404,'EVIDENCE_FILE_NOT_FOUND');
  const row=await db.evidenceAttachment.findFirst({where:{id:req.params.id,orgId,status:'READY',...(viewer?.orgRole==='WORKER'?{purpose:'WORK_REPORT'}:{})}});
  if(!row)throw createHttpError(404,'EVIDENCE_FILE_NOT_FOUND');
  await evidenceAttachmentActor(db,orgId,actorId,row.purpose,gates,ctx.organization.type);
  // Unsubmitted files are private to their uploader. Actual document FKs unlock company review.
  if(row.purpose==='WORK_REPORT'){
   if(row.createdByEmployeeId!==actorId&&!(await db.$queryRawUnsafe(`SELECT 1 FROM "EvidenceAttachmentLink" l JOIN "WorkTaskReport" r ON r.id=l."workReportId" AND r."orgId"=l."orgId" JOIN "DashboardWorkRequest" t ON t.id=r."requestId" AND t."orgId"=r."orgId" WHERE l."attachmentId"=$1 AND l."orgId"=$2 AND (t."senderId"=$3 OR t."recipientId"=$3) LIMIT 1`,row.id,orgId,actorId)).length)throw createHttpError(404,'EVIDENCE_FILE_NOT_FOUND');
  }else if(row.createdByEmployeeId!==actorId&&!await db.evidenceAttachmentLink.findFirst({where:{attachmentId:row.id,orgId}}))throw createHttpError(404,'EVIDENCE_FILE_NOT_FOUND');
  const config=evidenceStorageConfig(orgId);if(!config)throw createHttpError(503,'EVIDENCE_STORAGE_NOT_CONFIGURED');
  if(config.baseUrl!==row.storageRoot)throw createHttpError(503,'EVIDENCE_STORAGE_CONFIG');
  const bytes=await webdavEvidenceStore(config).read(row.storageKey);
  if(bytes.length!==row.byteSize||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw createHttpError(409,'EVIDENCE_STORAGE_MISMATCH');
  res.setHeader('Cache-Control','no-store');res.json({fileName:row.originalFileName,contentType:row.contentType,contentBase64:bytes.toString('base64')});
 });
}
// Called before approval preview/save. NAS paths cannot masquerade as legacy external paths.
export async function validateAttachmentEvidence(db:any,orgId:number,items:any[]|undefined,purpose:string){
 for(const item of items||[]){
  if(!/^\/nas-evidence(?:\/|$)/i.test(item.path||''))continue;
  const id=item.path.split('/')[2];
  const row=await db.evidenceAttachment.findFirst({where:{id,orgId,status:'READY',purpose}});
  if(!row||item.path!==attachmentPath(row.id,row.originalFileName))throw createHttpError(400,'EVIDENCE_FILE_NOT_FOUND');
 }
 return items;
}
