// Keep this implementation identical to backend/src/utils/humanTextCase.js.
import {defaultTextAcronyms} from './textAcronyms.js';
let acronyms=new Map(defaultTextAcronyms.map(row=>[row.acronym.toUpperCase(),row.acronym]));
const acronymListeners=new Set();
let acronymVersion=0;
export const subscribeTextAcronyms=listener=>{acronymListeners.add(listener);return()=>acronymListeners.delete(listener);};
export const textAcronymVersion=()=>acronymVersion;
export function setTextAcronyms(entries){
 const next=new Map(entries.map(row=>[row.acronym.toUpperCase(),row.acronym]));
 if(JSON.stringify([...next])===JSON.stringify([...acronyms]))return;
 acronyms=next;acronymVersion++;for(const listener of acronymListeners)listener();
}
const humanKeys=new Set(['name','nameen','nameko','namevi','title','label','description','remark','remarks','memo','note','notes','address','addressen','companyaddress','pickupaddress','deliveryaddress','origin','destination','placeofreceipt','placeofdelivery','issueplace','contactname','manager','representative','driver','designer','season','vessel','bankname','employeename','recipient','recipientname','actualrequestername','actualrequesteraddress','purpose','rejectreason','reason','delayreason','warehousename','departmentname','positionname','stylename','processname','productname','itemname','currencyname']);
const companyKeys=new Set(['companyname','companynameen','companynameko','companynamevi','organizationname','organizationnameen','organizationnameko','organizationnamevi']);
const protectedTrees=new Set(['snapshot','snapshots','requestsnapshot','sharedsnapshot','original','before','after','file','files','base64','html','template','signature','hash','auth','user','metadata','approvalSelection'.toLowerCase(),'policy','sourceSnapshot'.toLowerCase()]);
const companyContainers=new Set(['company','organization','entity','customer','supplier','seller','buyer','issuer','forwarder','shipperparty','consigneeparty','notifyparty','shipper','consignee','notify','linkedcompany','officialcompany','companyconnection']);
const fieldKey=value=>String(value||'').replace(/[_-]/g,'').toLowerCase();
const bankUpperKeys=new Set(['bankname','accountname','accountholder','swift','swiftcode']);

export function titleCaseWords(value){
 if(typeof value!=='string'||!value)return value;
 // Match complete protected tokens first; never rewrite references embedded in prose.
 return value.replace(/https?:\/\/[^\s<>]+|[\w.!#$%&'*+/=?^`{|}~-]+@[\w.-]+\.[A-Za-z]{2,}|\{[^{}]+\}|[\p{L}\p{M}\d]+(?:[/'’][\p{L}\p{M}\d]+)*/giu,token=>{
  if(token.includes('@')||/^https?:\/\//i.test(token)||token.startsWith('{'))return token;
  if(/^x$/i.test(token))return 'x';
  if(acronyms.has(token.toUpperCase()))return acronyms.get(token.toUpperCase());
  if(/\d/.test(token)||!/^[\p{Script=Latin}\p{M}/'’]+$/u.test(token))return token;
  if(token.includes('/'))return token.split('/').map(part=>titleCaseWords(part)).join('/');
  const lower=token.toLocaleLowerCase('en-US');
  return lower.replace(/(^|[/'’])([\p{Script=Latin}])/gu,(match,separator,letter,offset)=>
   separator&&offset>0&&/['’](s|t|re|ve|ll|d|m)$/.test(lower.slice(offset))?match:separator+letter.toLocaleUpperCase('en-US'));
 });
}

export function textFieldCase(meta={}){
 const explicit=meta['data-text-case']||meta.inputProps?.['data-text-case']||meta.slotProps?.htmlInput?.['data-text-case'];
 if(explicit)return explicit;
 if(meta.select||meta.disabled||meta.InputProps?.readOnly||meta.readOnly||meta.inputProps?.readOnly||meta.inputProps?.role==='combobox')return 'preserve';
 if(meta.type&&!['text',''].includes(meta.type))return 'preserve';
 const key=fieldKey(meta.name||meta.inputProps?.name||meta.slotProps?.htmlInput?.name),label=typeof meta.label==='string'?meta.label:meta.inputProps?.['aria-label']||meta.slotProps?.htmlInput?.['aria-label']||meta['aria-label']||'';
 if(bankUpperKeys.has(key)||/bank\s*name|account\s*name|account\s*holder|swift(?:\s*code)?|은행|계좌명|예금주|ngân hàng|tên tài khoản|chủ tài khoản/i.test(label))return 'upper';
 if(companyKeys.has(key)||/company\s*name|organization\s*name|업체명|회사명|사업체명|tên công ty|tên doanh nghiệp/i.test(label))return 'preserve';
 if(/^(country|currency|incoterm|size|gender|locale|language|timezone|swift|iban|sku)$/.test(key)||/\b(country|currency|incoterm|size|gender|language|time.?zone|swift|iban|sku)\b|통화|국가|사이즈|성별|언어|인코텀즈/i.test(label))return 'preserve';
 if(/code|number|email|phone|url|password|search|keyword|account.?holder|filename|token|\bno\.?\b|\bunit\b|\bmarks\b|코드|번호|이메일|전화|연락처|검색|비밀번호|예금주|단위|mã|số điện|tìm kiếm|điện thoại/i.test(key+' '+label)||/^(?:(?:master|house|m\.?|h\.?)\s*)?(?:b\/?l|awb)$/i.test(label.trim()))return 'preserve';
 if(/^(shipper|consignee|notify|deliveryagent)$/.test(key)||/shipper|consignee|notify|SHPR|CNEE|송하인|수하인|통지처/i.test(label)&&!/address|contact|주소|담당자|địa chỉ/i.test(label))return 'party';
 if(humanKeys.has(key)||/\b(name|address|description|remark|memo|notes?|purpose|title|representative|driver|designer|vessel)\b|이름|성명|담당자|대표자|주소|설명|내용|비고|메모|제목|직원명|품목명|공정명|스타일명|선박명|tên|địa chỉ|ghi chú|mô tả/i.test(label))return 'title';
 return label?'title':'preserve';
}

export function titleCasePartyBlock(value){
 const at=value.indexOf('\n');return at<0?value.toUpperCase():value.slice(0,at).toUpperCase()+titleCaseWords(value.slice(at));
}

export function normalizeHumanPayload(value,{path='',key='',ancestors=[],depth=0,service=''}={}){
 // Dictionary spelling/expansions are authored verbatim, including mixed case.
 if(/^\/system\/text-acronyms(?:\/|$)/.test(path.split('?')[0]))return value;
 if(depth>40||value===null||value===undefined)return value;
 const normalizedKey=fieldKey(key);
 if(protectedTrees.has(normalizedKey))return value;
 if(typeof value==='string'){
  if(bankUpperKeys.has(normalizedKey)||normalizedKey==='displayname'&&/\/(?:bank-accounts|expense-bank-accounts)(?:\/|$)/i.test(path))return value.toUpperCase();
  if(normalizedKey==='label'&&ancestors.includes('routeLocationDetails')&&ancestors.at(-1)?.endsWith('_DOOR')&&service!=='EXPRESS')return value.toUpperCase();
  if(companyKeys.has(normalizedKey))return value.toUpperCase();
  const companyPath=/\/(organizations?|business-partners|customers|partner-editor|company-profile|company-identity|system-entities|entities|onboarding|auth\/workspaces)(\/|$)/i.test(path)&&!/(employees?|users?)(\/|$)/i.test(path);
  const companyRecord=companyContainers.has(fieldKey(ancestors.at(-1)))||companyPath&&ancestors.length===0||companyPath&&ancestors.some(part=>['patch','contacts'].includes(part));
  if(/^name(en|ko|vi)?$/.test(normalizedKey)&&companyRecord)return value.toUpperCase();
  if(['shipper','consignee','notify','deliveryagent'].includes(normalizedKey)){
   return titleCasePartyBlock(value);
  }
  return humanKeys.has(normalizedKey)?titleCaseWords(value):value;
 }
 if(Array.isArray(value))return value.map(item=>normalizeHumanPayload(item,{path,key,ancestors,depth:depth+1,service}));
 if(typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([child,item])=>[child,normalizeHumanPayload(item,{path,key:child,ancestors:key?[...ancestors,key]:ancestors,depth:depth+1,service:value.transportService||service})]));
}
