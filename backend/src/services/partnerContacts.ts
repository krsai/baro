import {createHttpError} from '../utils/http';
import {classificationTarget,requireClassificationActor} from './partnerClassification';

export const partnerContactKeys=['contactName','contactPhone','email','address'];
const aliases:any={contactName:'representative',contactPhone:'phone'};
export async function attachPartnerContacts(db:any,orgId:number,rows:any[]){
 if(!rows.length)return rows;
 const ids=[...new Set(rows.map(row=>row.entityId).filter(Number.isSafeInteger))];
 if(!ids.length)return rows;
 const contacts=await db.$queryRawUnsafe('SELECT * FROM "PartnerContact" WHERE "orgId"=$1 AND "entityId"=ANY($2::int[])',orgId,ids);
 return rows.map(row=>{
  const stored=contacts.find((item:any)=>item.orgId===orgId&&item.entityId===row.entityId),overrides=stored?.data||{};
  const defaults=Object.fromEntries(partnerContactKeys.map(key=>[key,row.linkedCompany?.subscriberOrgId?(row.linkedCompany[aliases[key]||key]??null):(row[key]??row[aliases[key]]??null)]));
  const effective={...defaults,...overrides};
  return {...row,...effective,representative:effective.contactName,phone:effective.contactPhone,...('manager' in row?{manager:effective.contactName,phoneNumber:effective.contactPhone}:{}),contactDefaults:defaults,contactOverrides:overrides,contactRevision:stored?.revision??0};
 });
}
// The caller's transaction owns validation, the revision check and the write.
// An empty patch follows defaults; null removes a single override, '' clears it.
export async function savePartnerContacts(tx:any,orgId:number,entityId:number,actorId:number,input:any){
 await requireClassificationActor(tx,orgId,actorId);
 if(entityId===orgId)throw createHttpError(400,'INVALID_PARTNER_ID');
 await classificationTarget(tx,orgId,entityId);
 if(!input||!Number.isSafeInteger(input.revision)||input.revision<0||!input.patch||typeof input.patch!=='object'||Array.isArray(input.patch))throw createHttpError(400,'PARTNER_CONTACT_INVALID');
 await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',entityId);
 const [current]=await tx.$queryRawUnsafe('SELECT * FROM "PartnerContact" WHERE "orgId"=$1 AND "entityId"=$2 FOR UPDATE',orgId,entityId);
 if((current?.revision??0)!==input.revision)throw createHttpError(409,'PARTNER_CONTACT_CHANGED');
 const data={...(current?.data||{})};
 for(const [key,value]of Object.entries(input.patch)){
  if(!partnerContactKeys.includes(key)||value!==null&&(typeof value!=='string'||value.length>(key==='address'?1000:key==='contactName'?200:key==='email'?254:100)))throw createHttpError(400,'PARTNER_CONTACT_INVALID');
  if(value===null){delete data[key];continue;}
  const text=(value as string).trim();
  if(key==='address'&&text!==current?.data?.address&&(/[\r\n]/.test(text)||[...text].some(char=>/\p{L}/u.test(char)&&!/\p{Script=Latin}/u.test(char))))throw createHttpError(400,'COMPANY_DOCUMENT_CONTACT_ENGLISH_REQUIRED');
  data[key]=text;
 }
 await tx.$executeRawUnsafe('INSERT INTO "PartnerContact"("orgId","entityId",data,revision,"updatedByEmployeeId") VALUES($1,$2,$3::jsonb,1,$4) ON CONFLICT("orgId","entityId") DO UPDATE SET data=EXCLUDED.data,revision="PartnerContact".revision+1,"updatedByEmployeeId"=EXCLUDED."updatedByEmployeeId","updatedAt"=CURRENT_TIMESTAMP',orgId,entityId,JSON.stringify(data),actorId);
}
