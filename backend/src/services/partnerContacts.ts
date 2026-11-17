import {editRevision} from '../utils/editRevision';
import {createHttpError} from '../utils/http';
import {classificationTarget,requireClassificationActor} from './partnerClassification';
import {attachLinkedCompanies} from './companyConnections';
import {entityProfile} from './entityProfile';
import {partnerDisplayKeys,profileSnapshot,readCompanyProfileDefaults} from './companyProfileDefaults';

export const partnerNameKeys=['name','nameKo','nameVi'];
export const partnerContactKeys=[...partnerDisplayKeys,...partnerNameKeys];
const aliases:any={contactName:'representative',contactPhone:'phone'};
export async function attachPartnerContacts(db:any,orgId:number,rows:any[]){
 if(!rows.length)return rows;
 const ids=[...new Set(rows.map(row=>row.entityId).filter(Number.isSafeInteger))];if(!ids.length)return rows;
 const contacts=await db.$queryRawUnsafe('SELECT * FROM "PartnerContact" WHERE "orgId"=$1 AND "entityId"=ANY($2::int[])',orgId,ids);
 const sourceIds=[...new Set(rows.map(row=>row.defaultSourceEntityId).filter(Number.isSafeInteger))] as number[];
 const sources=await readCompanyProfileDefaults(db,sourceIds);
 return rows.map(row=>{
  const stored=contacts.find((item:any)=>item.orgId===orgId&&item.entityId===row.entityId),overrides=stored?.data||{};
  const source=sources.find((item:any)=>item.entityId===row.defaultSourceEntityId);
  const fallback=Object.fromEntries(partnerContactKeys.map(key=>[key,row.linkedCompany?.subscriberOrgId?(row.linkedCompany[aliases[key]||key]??null):(row[key]??row[aliases[key]]??null)]));
  const localRow=row.localContactProfile||{};
  const officialNames=Object.fromEntries(partnerNameKeys.map(key=>[key,row.linkedCompany?.[key]??source?.[key]??row[key]??row.entity?.[key]??null]));
  const localNames=Object.fromEntries(partnerNameKeys.map(key=>[key,localRow[key]??row[key]??row.entity?.[key]??officialNames[key]]));
  const registration={...localNames,...(source?.registrationData||(source?profileSnapshot(source):fallback))};
  const defaults={...officialNames,...(source?.selfData||(source?profileSnapshot(source):fallback))};
  const localFields=Object.fromEntries(partnerContactKeys.filter(key=>localRow[key]!=null).map(key=>[key,localRow[key]]));
  // A canonical company row may already contain its new self-managed default.
  // Its original registrar must keep the preserved pre-claim registration.
  const existedBeforeSelf=source?.selfManagedAt&&row.contactConnectedAt&&new Date(row.contactConnectedAt)<new Date(source.selfManagedAt);
  const originalRegistrar=(source?.registrationOwnerOrgId??source?.ownerOrgId??source?.dataOwnerOrgId)===orgId&&row.entityId===source?.entityId;
  const initial=source?.selfData&&!existedBeforeSelf&&!originalRegistrar?defaults:registration;
  const base=stored?.base?{...localNames,...stored.base}:{...initial,...(source?.selfData&&row.entityId===source.entityId?{}:localFields)};
  const local={...base,...overrides};
  const existingRelationshipContact=!row.linkedCompany&&partnerContactKeys.some(key=>localRow[key]!=null&&localRow[key]!==registration[key]);
  const mode=stored?.mode||(Object.keys(overrides).length||existedBeforeSelf||originalRegistrar||existingRelationshipContact?'LOCAL':'DEFAULT');
  const effective=mode==='DEFAULT'?defaults:local;
  const {localContactProfile,...visible}=row;
  return {...visible,...effective,representative:effective.contactName,phone:effective.contactPhone,...('manager' in row?{manager:effective.contactName,phoneNumber:effective.contactPhone}:{}),contactDefaults:defaults,contactDefaultRevision:editRevision(partnerContactKeys.map(key=>defaults[key]??null)),contactLocal:local,contactBase:base,contactMode:mode,contactOverrides:overrides,contactRevision:stored?.revision??0,contactSourceProtected:Boolean(source?.selfData||source?.legacySelfManaged),contactDefaultSource:{kind:source?.selfData?'SELF':'REGISTRATION',entityId:row.defaultSourceEntityId??row.entityId,orgId:source?.selfData?source.entityId:(source?.registrationOwnerOrgId??source?.ownerOrgId??source?.dataOwnerOrgId??null)}};
 });
}

// Caller owns the transaction. Both source switching and local edits are revisioned;
// switching to DEFAULT never destroys the saved LOCAL data or its baseline.
export async function savePartnerContacts(tx:any,orgId:number,entityId:number,actorId:number,input:any,loadedProfile?:any){
 await requireClassificationActor(tx,orgId,actorId);
 if(entityId===orgId)throw createHttpError(400,'INVALID_PARTNER_ID');
 const target=await classificationTarget(tx,orgId,entityId);
 if(!input||!Number.isSafeInteger(input.revision)||input.revision<0||!input.patch||typeof input.patch!=='object'||Array.isArray(input.patch)||input.mode!==undefined&&!['LOCAL','DEFAULT'].includes(input.mode)||input.baseMode!==undefined&&input.baseMode!=='DEFAULT')throw createHttpError(400,'PARTNER_CONTACT_INVALID');
 await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',entityId);
 const [current]=await tx.$queryRawUnsafe('SELECT * FROM "PartnerContact" WHERE "orgId"=$1 AND "entityId"=$2 FOR UPDATE',orgId,entityId);
 if((current?.revision??0)!==input.revision)throw createHttpError(409,'PARTNER_CONTACT_CHANGED');
 const data={...(input.baseMode==='DEFAULT'?{}:current?.data||{})};
 for(const [key,value]of Object.entries(input.patch)){
  if(!partnerContactKeys.includes(key)||value!==null&&(typeof value!=='string'||value.length>(key==='address'?1000:['name','nameKo','nameVi','contactName'].includes(key)?200:key==='email'?254:100)))throw createHttpError(400,'PARTNER_CONTACT_INVALID');
  if(value===null){delete data[key];continue;}
  const text=(value as string).trim();
  if(key==='address'&&text!==current?.data?.address&&(/[\r\n]/.test(text)||[...text].some(char=>/\p{L}/u.test(char)&&!/\p{Script=Latin}/u.test(char))))throw createHttpError(400,'COMPANY_DOCUMENT_CONTACT_ENGLISH_REQUIRED');
  if(key==='name'&&!text)throw createHttpError(400,'PARTNER_CONTACT_INVALID');
  data[key]=partnerNameKeys.includes(key)?text.toUpperCase():text;
 }
 let profile=loadedProfile;
 if(!profile){[profile]=await attachLinkedCompanies(tx,orgId,[{...entityProfile(target.entity),entityId,id:entityId,contactConnectedAt:target.entity.createdAt}]);}
 if(input.baseMode==='DEFAULT'&&input.defaultRevision!==undefined&&input.defaultRevision!==profile.contactDefaultRevision)throw createHttpError(409,'PARTNER_CONTACT_CHANGED');
 const mode=input.mode||(Object.values(input.patch).some(value=>value!==null)?'LOCAL':profile.contactMode);
 const base=input.baseMode==='DEFAULT'?profile.contactDefaults:current?.base||profile.contactBase;
 await tx.$executeRawUnsafe('INSERT INTO "PartnerContact"("orgId","entityId",data,revision,"updatedByEmployeeId",base,mode) VALUES($1,$2,$3::jsonb,1,$4,$5::jsonb,$6) ON CONFLICT("orgId","entityId") DO UPDATE SET data=EXCLUDED.data,base=EXCLUDED.base,mode=EXCLUDED.mode,revision="PartnerContact".revision+1,"updatedByEmployeeId"=EXCLUDED."updatedByEmployeeId","updatedAt"=CURRENT_TIMESTAMP',orgId,entityId,JSON.stringify(data),actorId,JSON.stringify(base),mode);
}
