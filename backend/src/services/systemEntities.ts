import {createHash} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {assertEditRevision,editRevision,retryEditTransaction} from '../utils/editRevision';
import {normalizeLocalizedName,validLocalizedName} from '../utils/localizedName';
import {normalizePartyKind,normalizePartnerCode,partnerProfilePatch} from './entityProfile';
import {businessLegalForm} from './businessLegalForm';
import {CLASSIFICATION_INCLUDE,effectiveClassification} from './partnerClassification';
import {partnerRoleCatalogue} from './partnerRoleCatalogue';

const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
const fields={id:true,name:true,nameKo:true,nameVi:true,code:true,businessNumber:true,partyKind:true,businessLegalForm:true,
 representative:true,representativeEmployeeId:true,phone:true,email:true,country:true,countryCode:true,address:true,isActive:true,
 ownerOrgId:true,dataOwnerOrgId:true,type:true,updatedAt:true} as const;
const root=(row:any)=>row.ownerOrgId==null&&(row.dataOwnerOrgId==null||row.dataOwnerOrgId===row.id)&&['MANUFACTURER','BRAND','SERVICE'].includes(row.type);
const json=(value:any)=>JSON.parse(JSON.stringify(value));
async function actor(db:any,email:string){const user=await db.systemUser.findUnique({where:{email},select:{id:true,email:true,systemRole:true}});if(user?.systemRole!=='SYSTEM_ADMIN')fail('SYSTEM_ADMIN_REQUIRED',403);return user;}
async function entity(db:any,id:number){const row=await db.organization.findUnique({where:{id},select:fields});if(!row)fail('ENTITY_NOT_FOUND',404);return row;}
async function target(db:any,row:any){
 if(root(row))return row;
 const orgId=row.ownerOrgId||row.dataOwnerOrgId;
 if(!orgId)return row;
 const [identity,company]=await Promise.all([
  db.companyIdentityLink.findUnique({where:{orgId_entityId:{orgId,entityId:row.id}},include:{identity:{select:{anchorEntityId:true}}}}),
  db.companyPartnerLink.findUnique({where:{orgId_entityId:{orgId,entityId:row.id}},select:{targetOrgId:true}})]);
 const id=identity?.identity.anchorEntityId||company?.targetOrgId;
 return id&&id!==row.id?entity(db,id):row;
}
const quote=(value:string)=>'"'+value.replaceAll('"','""')+'"';
const usageKind=(table:string)=>table==='Employee'?'employees':table==='OrgRelationship'?'relationships':/CompanyIdentity|CompanyPartner/.test(table)?'links':/Subscription|WorkspaceRegistration/.test(table)?'subscriptions':/Invoice|Expense|Ledger|Transaction|Payroll|Salary|BankAccount/.test(table)?'finance':/Work|Assignment|Factory|Style|Freight|Shipment|Attendance/.test(table)?'operations':'other';

// Inspect every real Organization FK, including future modules and cascading
// references. Classification-only metadata may be cleaned with an unused entity.
export async function systemEntityUsage(db:any,ids:number[]){
 if(!ids.length)return new Map<number,any[]>();
 const refs:any[]=await db.$queryRawUnsafe(`SELECT c.relname AS "tableName",a.attname AS "columnName" FROM pg_constraint f
 JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN LATERAL unnest(f.conkey,f.confkey) keys(local_key,remote_key) ON true
 JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=keys.local_key
 JOIN pg_attribute remote ON remote.attrelid=f.confrelid AND remote.attnum=keys.remote_key
 WHERE f.contype='f' AND f.confrelid='"Organization"'::regclass AND n.nspname='public' AND remote.attname='id'`);
 const unique=[...new Map(refs.map(row=>[row.tableName+':'+row.columnName,row])).values()];
 const queries=unique.filter(row=>row.tableName!=='PartnerClassification'||row.columnName==='orgId').map(row=>{
  const table=quote(row.tableName),column=quote(row.columnName);
  const extra=row.tableName==='Organization'?` AND id<>${column}`:row.tableName==='PartnerClassification'?` AND "entityId"<>${column}`:'';
  return `SELECT ${column} AS id,'${usageKind(row.tableName)}' AS kind,count(*)::int AS count FROM ${table} WHERE ${column}=ANY($1::int[])${extra} GROUP BY ${column}`;
 });
 const result=new Map<number,any[]>(ids.map(id=>[id,[]]));
 if(queries.length){const rows:any[]=await db.$queryRawUnsafe('SELECT id,kind,sum(count)::int AS count FROM ('+queries.join(' UNION ALL ')+') counts GROUP BY id,kind',ids);for(const row of rows)result.get(row.id)?.push({kind:row.kind,count:row.count});}
 return result;
}

async function scopes(db:any,requested:any,canonical:any){
 const id=root(canonical)&&canonical.id!==requested.id?canonical.id:requested.id;
 const base=id===canonical.id?canonical:requested;
 const stored=await db.partnerClassification.findMany({where:{entityId:id},include:CLASSIFICATION_INCLUDE,orderBy:{orgId:'asc'}});
 const relationships=await db.orgRelationship.findMany({where:{OR:[{manufacturerOrgId:id},{brandOrgId:id}]},select:{manufacturerOrgId:true,brandOrgId:true}});
 const orgIds=root(base)?[id]:[...new Set<number>([...stored.map((row:any)=>row.orgId),...(root(base)?[id]:[]),...(base.ownerOrgId?[base.ownerOrgId]:[]),...relationships.map((row:any)=>row.manufacturerOrgId===id?row.brandOrgId:row.manufacturerOrgId)])];
 const owners=orgIds.length?await db.organization.findMany({where:{id:{in:orgIds}},select:{id:true,name:true,nameKo:true,nameVi:true}}):[];
 return orgIds.map(orgId=>({orgId,entityId:id,owner:owners.find((row:any)=>row.id===orgId),classification:effectiveClassification(stored.find((row:any)=>row.orgId===orgId))}));
}
async function read(db:any,id:number){
 const requested=await entity(db,id),canonical=await target(db,requested),classifications=await scopes(db,requested,canonical);
 const usage=(await systemEntityUsage(db,[id])).get(id)||[];
 const identityLocked=!!await db.companyIdentity.findUnique({where:{anchorEntityId:canonical.id},select:{id:true}});
 return {requested,entity:canonical,classifications,usage,identityLocked,canDelete:!usage.length,revision:editRevision({requested,entity:canonical,classifications})};
}
export async function systemEntityCatalogue(db:any,email:string){await actor(db,email);return {roles:await partnerRoleCatalogue(db),industries:await db.settingServiceDefault.findMany({where:{code:{not:'GENERAL'}},include:{partnerRole:true},orderBy:[{sortOrder:'asc'},{id:'asc'}]})};}
export async function listSystemEntities(db:any,email:string,input:any){
 await actor(db,email);const query=String(input.q||'').trim(),page=Number(input.page||0);
 if(query.length>100||!Number.isSafeInteger(page)||page<0||page>100000)fail('INVALID_ENTITY_QUERY');
 const searchFields=['name','nameKo','nameVi','code','businessNumber','email'].map(field=>({[field]:{contains:query,mode:'insensitive'}}));
 const where:any={...(input.status==='active'?{isActive:true}:input.status==='inactive'?{isActive:false}:{}),...(query?{OR:[...searchFields,{localCompanyLinks:{some:{target:{OR:searchFields}}}},{identityLinks:{some:{identity:{anchor:{OR:searchFields}}}}}]}:{} )};
 const [total,rows]=await Promise.all([db.organization.count({where}),db.organization.findMany({where,select:{...fields,owner:{select:{name:true,nameKo:true,nameVi:true}},dataOwner:{select:{name:true,nameKo:true,nameVi:true}},localCompanyLinks:{select:{orgId:true,targetOrgId:true}},identityLinks:{select:{orgId:true,identity:{select:{anchorEntityId:true}}}}},orderBy:{id:'asc'},skip:page*50,take:50})]);
 const targets=new Map<number,number>(rows.map((row:any)=>{const orgId=row.ownerOrgId||row.dataOwnerOrgId;return [row.id,root(row)?row.id:row.identityLinks?.find((link:any)=>link.orgId===orgId)?.identity.anchorEntityId||row.localCompanyLinks?.find((link:any)=>link.orgId===orgId)?.targetOrgId||row.id];}));
 const targetIds=[...new Set(targets.values())],canonical=targetIds.length?await db.organization.findMany({where:{id:{in:targetIds}},select:fields}):[];
 const profiles=rows.length?await db.partnerClassification.findMany({where:{entityId:{in:[...new Set([...rows.map((row:any)=>row.id),...targetIds])]}},include:CLASSIFICATION_INCLUDE,orderBy:{orgId:'asc'}}):[];
 const usage=await systemEntityUsage(db,rows.map((row:any)=>row.id));
 return {rows:rows.map((row:any)=>{const source=canonical.find((value:any)=>value.id===targets.get(row.id))||row,official=root(source)&&source.id!==row.id;return {...row,name:source.name,nameKo:source.nameKo,nameVi:source.nameVi,code:source.code,owner:row.owner||row.dataOwner,subscriber:root(row),classifications:profiles.filter((profile:any)=>official?profile.orgId===source.id&&profile.entityId===source.id:profile.entityId===row.id).map((profile:any)=>effectiveClassification(profile)),usage:usage.get(row.id)||[],canDelete:!(usage.get(row.id)||[]).length};}),page,total};
}
export async function readSystemEntity(db:any,email:string,id:number){await actor(db,email);return read(db,id);}

function patch(body:any,previous:any){
 if(!body||typeof body!=='object'||Array.isArray(body))fail('INVALID_ENTITY_PROFILE');
 const allowed=['name','nameKo','nameVi','code','partyKind','businessLegalForm','businessNumber','country','countryCode','address','representative','phone','email','isActive'];
 if(Object.keys(body).some(key=>!allowed.includes(key)))fail('INVALID_ENTITY_PROFILE');
 const data:any=partnerProfilePatch(body);
 if(['name','nameKo','nameVi'].some(key=>Object.hasOwn(body,key))){const names={...previous,...body};if(!validLocalizedName({...names,nameEn:names.name}))fail('INVALID_ENTITY_PROFILE');const value=normalizeLocalizedName(names,'name');data.name=value.name;data.nameKo=value.nameKo||null;data.nameVi=value.nameVi||null;}
 if(Object.hasOwn(body,'partyKind'))data.partyKind=normalizePartyKind(body.partyKind);
 if(Object.hasOwn(body,'businessLegalForm'))data.businessLegalForm=businessLegalForm(body.businessLegalForm);
 for(const [key,max] of Object.entries({representative:200,phone:100})){if(!Object.hasOwn(body,key))continue;if(body[key]!=null&&(typeof body[key]!=='string'||body[key].length>max))fail('INVALID_ENTITY_PROFILE');data[key]=body[key]?.trim()||null;}
 if(Object.hasOwn(body,'isActive')){if(typeof body.isActive!=='boolean')fail('INVALID_ENTITY_PROFILE');data.isActive=body.isActive;}
 if(Object.hasOwn(body,'code')){data.code=normalizePartnerCode(body.code);if(data.code!==previous.code&&(data.partyKind??previous.partyKind)==='CORPORATE'&&(!data.code||!/^[A-Z0-9]{4}$/.test(data.code)))fail('CORPORATE_PARTNER_CODE_INVALID');}
 if(data.representative!==undefined&&data.representative!==previous.representative)data.representativeEmployeeId=null;
 if((data.partyKind??previous.partyKind)==='CORPORATE'&&(previous.partyKind!=='CORPORATE'||!!previous.businessNumber)&&!(data.businessNumber===undefined?previous.businessNumber:data.businessNumber))fail('PARTNER_BUSINESS_NUMBER_REQUIRED');
 return data;
}
async function saveIndustries(tx:any,scope:any,body:any,user:any){
 if(!Number.isSafeInteger(body.revision)||body.revision!==scope.classification.revision)fail('PARTNER_CLASSIFICATION_CHANGED',409);
 const ids=body.industryIds;if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(ids).size!==ids.length)fail('PARTNER_CLASSIFICATION_REQUIRED');
 const values=await tx.settingServiceDefault.findMany({where:{id:{in:ids}},select:{id:true,isActive:true,code:true}});
 if(values.length!==ids.length||values.some((row:any)=>row.code==='GENERAL'||!row.isActive&&!scope.classification.industryIds.includes(row.id)))fail('PARTNER_CLASSIFICATION_REQUIRED');
 const key={orgId:scope.orgId,entityId:scope.entityId};
 if(scope.classification.explicit)await tx.partnerClassification.update({where:{orgId_entityId:key},data:{revision:{increment:1},updatedByEmployeeId:null,updatedBySystemUserId:user.id}});
 else await tx.partnerClassification.create({data:{...key,updatedByEmployeeId:null,updatedBySystemUserId:user.id}});
 await tx.partnerClassificationIndustry.deleteMany({where:key});await tx.partnerClassificationIndustry.createMany({data:ids.map((systemIndustryId:number)=>({...key,systemIndustryId}))});
 await tx.orgRelationship.updateMany({where:{OR:[{manufacturerOrgId:scope.orgId,brandOrgId:scope.entityId},{manufacturerOrgId:scope.entityId,brandOrgId:scope.orgId}]},data:{systemIndustryId:null}});
}
export async function mutateSystemEntity(db:any,email:string,id:number,body:any,remove=false){
 if(!Number.isSafeInteger(id)||id<=0)fail('INVALID_ENTITY_ID');
 if(!body||typeof body.clientKey!=='string'||!/^[0-9a-f-]{36}$/i.test(body.clientKey))fail('INVALID_ENTITY_KEY');
 const hash=createHash('sha256').update(JSON.stringify({id,remove,body})).digest('hex');
 try{return await retryEditTransaction(db,async(tx:any)=>{
  const user=await actor(tx,email),key=`SYSTEM_ENTITY_EDIT:${user.id}:${body.clientKey}`;
  const receipt=await tx.systemSetting.findUnique({where:{key}});if(receipt){if(receipt.value.requestHash!==hash)fail('ENTITY_RETRY_CONFLICT',409);return receipt.value.result;}
  const requested=await entity(tx,id),canonical=await target(tx,requested);
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[...new Set([id,canonical.id])].sort((a,b)=>a-b));
  const before=await read(tx,id);assertEditRevision(body.revision,before.revision);let result:any;
  if(remove){
   if(before.usage.length)fail('ENTITY_IN_USE',409);
   await tx.partnerClassificationIndustry.deleteMany({where:{entityId:id}});await tx.partnerClassification.deleteMany({where:{entityId:id}});
   await tx.organization.delete({where:{id}});result={deleted:true};
  }else{
   const data=patch(body.profile,before.entity);if(data.code&&data.code!==before.entity.code&&(await tx.organization.findFirst({where:{code:data.code,id:{not:before.entity.id}},select:{id:true}})||await tx.companyIdentity.findFirst({where:{code:data.code,anchorEntityId:{not:before.entity.id}},select:{id:true}})))fail('ENTITY_CODE_CONFLICT',409);if(before.identityLocked&&['code','country','businessNumber'].some(key=>data[key]!==undefined&&(data[key]??'')!==(before.entity[key]??'')))fail('ENTITY_SHARED_IDENTITY_LOCKED',409);if(Object.keys(data).length)await tx.organization.update({where:{id:before.entity.id},data});
   if(body.classifications!==undefined){if(!Array.isArray(body.classifications)||body.classifications.length>200)fail('PARTNER_CLASSIFICATION_REQUIRED');const keys=new Set();for(const input of body.classifications){const scope:any=before.classifications.find((scope:any)=>scope.orgId===input.orgId&&scope.entityId===input.entityId);if(!scope||keys.has(scope.orgId))fail('PARTNER_CLASSIFICATION_REQUIRED');keys.add(scope.orgId);await saveIndustries(tx,scope,input,user);}}
   result=await read(tx,id);
  }
  await tx.systemSetting.create({data:{key,updatedBy:user.email,value:json({actor:{id:user.id,email:user.email},action:remove?'DELETE':'UPDATE',requestHash:hash,before,result})}});return result;
 });}catch(error:any){if(error.code==='P2003')fail('ENTITY_IN_USE',409);if(error.code==='P2002')fail('ENTITY_CODE_CONFLICT',409);throw error;}
}
export function registerSystemEntityRoutes(app:any,db:any,gates:any){
 const access=(req:any,res:any)=>gates.requireSystemAdmin(req,res);
 app.get('/system/entities/catalogue',async(req:any,res:any)=>{const user=await access(req,res);if(user)res.json(await systemEntityCatalogue(db,user.requesterEmail));});
 app.get('/system/entities',async(req:any,res:any)=>{const user=await access(req,res);if(user)res.json(await listSystemEntities(db,user.requesterEmail,req.query));});
 app.get('/system/entities/:id',async(req:any,res:any)=>{const user=await access(req,res);if(!user)return;const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<=0)fail('INVALID_ENTITY_ID');res.json(await readSystemEntity(db,user.requesterEmail,id));});
 for(const [method,remove] of [['put',false],['delete',true]] as const)app[method]('/system/entities/:id',async(req:any,res:any)=>{const user=await access(req,res);if(user)res.json(await mutateSystemEntity(db,user.requesterEmail,Number(req.params.id),req.body,remove));});
}
