import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {ledgerReferenceRows} from '../frontend/src/utils/ledgerReferences.mjs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {evidenceStorageConfig,evidenceUploadInput,uploadEvidence,webdavEvidenceStore,attachmentPath}=require('../backend/dist/services/evidenceStorage');
const {validateAttachmentEvidence,evidenceAttachmentActor,registerEvidenceAttachmentRoutes}=require('../backend/dist/services/evidenceAttachments');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {requestChangeApproval,decideChangeApproval}=require('../backend/dist/services/changeApprovals');
const {normalizeDocumentEvidence,evidenceDisplayFilename}=require('../backend/dist/services/documentEvidence');
const {validEvidencePath}=require('../backend/dist/utils/evidencePath');
const bytes=Buffer.from('%PDF-1.7\nTest Evidence\n%%EOF');
const input=(extra={})=>({clientKey:randomUUID(),fileName:'11월 운송비 영수증.pdf',contentBase64:bytes.toString('base64'),...extra});
const envFor=org=>({EVIDENCE_NAS_COMPANIES_JSON:JSON.stringify({[org]:{baseUrl:'https://nas.example.test/DEX_EVIDENCE/',username:'dex_app',password:'test-only'}})});

test('company storage config is absent by default and cannot overlap companies or use plaintext transport',()=>{
 assert.equal(evidenceStorageConfig(1,{}),null);
 assert.equal(evidenceStorageConfig(2,envFor(1)),null);
 for(const config of [[],{1:{baseUrl:'http://nas.test/share/',username:'a',password:'x'}},{1:{baseUrl:'https://nas.test/',username:'a',password:'x'}},{1:{baseUrl:'https://nas.test/share/',username:'a',password:'x'},2:{baseUrl:'https://nas.test/share/sub/',username:'b',password:'x'}},{1:{baseUrl:'https://nas.test/a/',username:'same',password:'x'},2:{baseUrl:'https://nas.test/b/',username:'same',password:'x'}}])assert.throws(()=>evidenceStorageConfig(1,{EVIDENCE_NAS_COMPANIES_JSON:JSON.stringify(config)}),/EVIDENCE_STORAGE_CONFIG/);
 assert.throws(()=>evidenceStorageConfig(1,{EVIDENCE_NAS_COMPANIES_JSON:'broken'}),/EVIDENCE_STORAGE_CONFIG/);
});
test('upload validates original filenames, actual signatures and bounded payloads',()=>{
 const file=evidenceUploadInput(input());assert.equal(file.contentType,'application/pdf');assert.equal(file.byteSize,bytes.length);
 assert.equal(validEvidencePath(attachmentPath(file.id,file.fileName)),false,'legacy path APIs cannot accept managed attachments');
 assert.equal(evidenceDisplayFilename(attachmentPath(file.id,file.fileName)),file.fileName);
 assert.deepEqual(ledgerReferenceRows({evidenceType:'FILE',evidenceNumber:attachmentPath(file.id,file.fileName)},'ko'),[['증빙 파일명',file.fileName]]);
 assert.equal(evidenceDisplayFilename('/nas-evidence/'+file.id+'/%bad%'),'%bad%');
 for(const bad of [{fileName:'../file.pdf'},{fileName:'bad.exe'},{fileName:'receipt.pdf',contentBase64:Buffer.from('not pdf').toString('base64')},{contentBase64:'a'.repeat(8*1024*1024)},{clientKey:'not-an-id'}])assert.throws(()=>evidenceUploadInput(input(bad)),/EVIDENCE_FILE_/);
});
test('WebDAV creates server folders, refuses overwrites and verifies retry content',async()=>{
 const config=evidenceStorageConfig(1,envFor(1)),calls=[];
 const fake=async(url,options)=>{calls.push({url:String(url),...options});return options.method==='MKCOL'?new Response(null,{status:405}):options.method==='PUT'?new Response(null,{status:412}):new Response(bytes);};
 const store=webdavEvidenceStore(config,fake);await store.write('2026/11/'+randomUUID()+'.pdf',bytes);
 assert.deepEqual(calls.map(c=>c.method),['MKCOL','MKCOL','PUT','GET']);assert.equal(calls[2].headers['If-None-Match'],'*');assert.ok(calls.every(c=>c.url.startsWith(config.baseUrl)&&c.redirect==='error'));
 await assert.rejects(webdavEvidenceStore(config,async(url,o)=>o.method==='GET'?new Response('other'):new Response(null,{status:201})).write('2026/11/'+randomUUID()+'.pdf',bytes),/EVIDENCE_STORAGE_MISMATCH/);
 await assert.rejects(store.read('../secret.pdf'),/EVIDENCE_FILE_INVALID/);
});
test('NAS evidence routes fail closed for inactive employees, company roles and saved feature policy',async()=>{
 const db={employee:{findFirst:async()=>({id:1,orgRole:'OPERATOR'})}},gates={canAccess:async()=>false};
 await assert.rejects(evidenceAttachmentActor(db,1,1,'BANK_LEDGER',gates,'SERVICE'),/EVIDENCE_ACCESS_DENIED/);
 await assert.rejects(evidenceAttachmentActor(db,1,1,'EXPENSE',gates,'SERVICE'),/EVIDENCE_ACCESS_DENIED/);
 await assert.rejects(evidenceAttachmentActor({employee:{findFirst:async()=>null}},1,1,'EXPENSE',gates,'SERVICE'),/EVIDENCE_ACCESS_DENIED/);
});
test('company attachments retain original names, retry safely, link actual document FKs and preserve approval history',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
 const db=f.db,s=await seedChangeApproval(db),org=s.company.id,scope={orgId:org,actorId:s.people.junior.id,purpose:'EXPENSE'},env=envFor(org),first=input(),objects=new Map();let writes=0;
 const store=()=>({write:async(key,data)=>{writes++;objects.set(key,data);},read:async key=>objects.get(key)});
 await assert.rejects(uploadEvidence(db,scope,first,store,{}),/EVIDENCE_STORAGE_NOT_CONFIGURED/);assert.equal(await db.evidenceAttachment.count(),0);
 const evidence=await uploadEvidence(db,scope,first,store,env);assert.equal(evidence.path,attachmentPath(first.clientKey,first.fileName));
 const routes=new Map(),gates={requireOrgRole:async()=>({organization:s.company}),actorId:()=>s.people.junior.id,canAccess:async()=>true};
 registerEvidenceAttachmentRoutes({get:(path,fn)=>routes.set('GET '+path,fn),post:(path,fn)=>routes.set('POST '+path,fn)},db,gates);
 const oldEnv=process.env.EVIDENCE_NAS_COMPANIES_JSON;
 try{
  delete process.env.EVIDENCE_NAS_COMPANIES_JSON;
  const response={setHeader(){},json(value){this.value=value;}};
  await routes.get('GET /evidence-attachments/status')({query:{purpose:'EXPENSE'}},response);
  assert.deepEqual(response.value,{configured:false,maxBytes:5242880});
  gates.requireOrgRole=async()=>({organization:s.other});
  await assert.rejects(routes.get('GET /evidence-attachments/:id/content')({params:{id:first.clientKey}},response),/EVIDENCE_FILE_NOT_FOUND/);
  gates.requireOrgRole=async()=>({organization:s.company});
  await assert.rejects(routes.get('GET /evidence-attachments/:id/content')({params:{id:first.clientKey}},response),/EVIDENCE_STORAGE_NOT_CONFIGURED/);
 }finally{if(oldEnv===undefined)delete process.env.EVIDENCE_NAS_COMPANIES_JSON;else process.env.EVIDENCE_NAS_COMPANIES_JSON=oldEnv;}
 assert.deepEqual(await uploadEvidence(db,scope,first,store,env),evidence);assert.equal(writes,1);
 const row=await db.evidenceAttachment.findUnique({where:{id:first.clientKey}});assert.equal(row.status,'READY');assert.equal(row.originalFileName,first.fileName);assert.match(row.storageKey,new RegExp(first.clientKey+'\\.pdf$'));assert.ok(!row.storageKey.includes('영수증'));
 const duplicate=await uploadEvidence(db,scope,input(),store,env);assert.notEqual(evidence.path,duplicate.path);
 await assert.rejects(uploadEvidence(db,scope,{...first,fileName:'other.pdf'},store,env),/EVIDENCE_UPLOAD_RETRY_MISMATCH/);
 await assert.rejects(validateAttachmentEvidence(db,s.other.id,[evidence],'EXPENSE'),/EVIDENCE_FILE_NOT_FOUND/);
 await assert.rejects(validateAttachmentEvidence(db,org,[evidence],'BANK_LEDGER'),/EVIDENCE_FILE_NOT_FOUND/);
 assert.deepEqual(normalizeDocumentEvidence([evidence]),[evidence]);
 const pending=input();await assert.rejects(uploadEvidence(db,scope,pending,()=>({write:async()=>{throw Error('network');}}),env),/network/);
 assert.equal((await db.evidenceAttachment.findUnique({where:{id:pending.clientKey}})).status,'PENDING');
 await assert.rejects(validateAttachmentEvidence(db,org,[{path:attachmentPath(pending.clientKey,pending.fileName),reference:''}],'EXPENSE'),/EVIDENCE_FILE_NOT_FOUND/);
 await uploadEvidence(db,scope,pending,store,env);assert.equal((await db.evidenceAttachment.findUnique({where:{id:pending.clientKey}})).status,'READY');
 const expense=await db.$transaction(tx=>registerExpenseRequest(tx,org,s.people.junior.id,{partnerOrgId:s.vendor.id,remark:'Expense',automaticRequestDate:true,clientKey:randomUUID(),evidenceFiles:[evidence],items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'10',vatRate:'0',details:{}}]}));
 const link=await db.evidenceAttachmentLink.findFirst({where:{attachmentId:first.clientKey,orgId:org}});assert.equal(link.expenseRequestId,expense.id);
 await assert.rejects(db.evidenceAttachment.update({where:{id:first.clientKey},data:{originalFileName:'changed.pdf'}}),/EVIDENCE_ATTACHMENT_IMMUTABLE/);
 await assert.rejects(db.evidenceAttachment.delete({where:{id:first.clientKey}}),/EVIDENCE_ATTACHMENT_IMMUTABLE/);
 await assert.rejects(db.evidenceAttachmentLink.delete({where:{id:link.id}}),/EVIDENCE_LINK_IMMUTABLE/);
 const bank=await uploadEvidence(db,{...scope,purpose:'BANK_LEDGER'},input(),store,env);
 const payload={documentVersion:1,evidenceFiles:[bank],schemaVersion:2,accountingCodeVersion:1,clientKey:randomUUID(),rows:[{entryKind:'BANK',accountId:s.account.id,transactionDate:'2026-11-05',direction:'IN',amount:'10',remark:'Received',purpose:'Received',evidenceType:'FILE',evidenceNumber:'',accountingCodeId:s.code.id,counterparty:{kind:'PARTNER',id:s.vendor.id},clientKey:randomUUID()}]};
 const request=await requestChangeApproval(db,org,s.people.admin.id,{menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:payload.clientKey,payload,clientKey:randomUUID(),selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id}});
 assert.equal(await db.evidenceAttachmentLink.count({where:{changeRequestId:request.id}}),1);
 for(const stage of request.policy.resolvedStages)await decideChangeApproval(db,org,stage.employeeId,request.id,{decision:'APPROVED'});
 const ledger=await db.bankLedgerDocument.findFirst({where:{orgId:org}});assert.equal(await db.evidenceAttachmentLink.count({where:{ledgerDocumentId:ledger.id}}),1);assert.deepEqual(ledger.evidenceFiles,[bank]);
 const sql=readFileSync('backend/prisma/migrations/20261128010000_nas_evidence_attachments/migration.sql','utf8');await f.pg.exec(sql);await f.pg.exec(sql);
 assert.equal(await db.evidenceAttachmentLink.count(),3);
 }finally{await f.close();}
});
