import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { loadSourceBindings } from './helpers/source-bindings.mjs';
import { normalizeLocalizedName, hasLocalizedName } from '../frontend/src/utils/localizedName.mjs';
const require=createRequire(import.meta.url);
const backend=require('../backend/dist/utils/localizedName.js');
const {validateCodeBase}=require('../backend/dist/services/codeBaseManagement.js');
const {validateServiceDefinition}=require('../backend/dist/services/partnerTransactionCost.js');
const {validateTransactionCode}=require('../backend/dist/services/transactionRequest.js');

for(const [input,expected] of [
 [{nameEn:'English',nameKo:'한글',nameVi:'Tiếng Việt'},'English'],
 [{nameEn:' ',nameKo:' 한글 ',nameVi:'Tiếng Việt'},'한글'],
 [{nameEn:'',nameKo:'',nameVi:' Tiếng Việt '},'Tiếng Việt'],
 [{nameEn:'',nameKo:'',nameVi:'',name:'Stale alias'},''],
 [{name:'Legacy'},'Legacy'],
])test(`English primary/fallback: ${expected||'all blank'}`,()=>{
 const result=normalizeLocalizedName(input);
 assert.equal(result.nameEn,expected);assert.equal(result.name,expected);
 assert.equal(result.nameKo,(input.nameKo||'').trim());assert.equal(result.nameVi,(input.nameVi||'').trim());
 assert.deepEqual(result,backend.normalizeLocalizedName(input));
 assert.equal(hasLocalizedName(input),Boolean(expected));
});
test('entity English slot accepts Korean or Vietnamese without a fourth field',()=>{
 for(const input of [{name:'',nameKo:'한글'},{name:'',nameVi:'Tiếng Việt'}]){
  assert.deepEqual(normalizeLocalizedName(input,'name'),backend.normalizeLocalizedName(input,'name'));
  const req={method:'POST',body:{...input}};backend.normalizeEntityNameInput(req,null,()=>{});
  assert.equal(req.body.name,input.nameKo||input.nameVi);assert.equal('nameEn' in req.body,false);
 }
 const req={method:'PUT',body:{nameKo:'수정'}};backend.normalizeEntityNameInput(req,null,()=>{});
 assert.equal('name' in req.body,false,'partial translation edits must preserve existing English');
});
for(const input of [{nameKo:'한국어만'},{nameVi:'Chỉ tiếng Việt'},{nameEn:'English only'}])test(`all setting APIs accept one name: ${Object.keys(input)[0]}`,()=>{
 const primary=Object.values(input)[0];
 const base=validateCodeBase({code:'ABC',serviceTypeId:1,taxTreatmentIds:[1],...input});
 const service=validateServiceDefinition({code:'ABC',entryMode:'GENERAL',requiredFields:[],...input});
 const code=validateTransactionCode({code:'ABCE',serviceTypeId:1,vatEnabled:false,taxTreatmentId:3,...input});
 for(const row of [base,service,code]){assert.equal(row.nameEn,primary);assert.equal(row.nameKo,input.nameKo||'');assert.equal(row.nameVi,input.nameVi||'');}
});
test('missing names and invalid values still reject; identity and tax validation remain',()=>{
 assert.throws(()=>validateCodeBase({code:'ABC',serviceTypeId:1,taxTreatmentIds:[1],nameEn:' ',nameKo:' ',nameVi:' '}));
 assert.throws(()=>validateCodeBase({code:'ABC',serviceTypeId:1,taxTreatmentIds:[1],nameEn:'valid',nameKo:{}}));
 assert.throws(()=>validateTransactionCode({code:'ABCV',serviceTypeId:1,vatEnabled:false,taxTreatmentId:3,nameKo:'한글'}));
 assert.throws(()=>validateServiceDefinition({code:'ABC',entryMode:'GENERAL',requiredFields:[],nameEn:'x'.repeat(101)}));
});
test('attribute saves use the current three inputs instead of a stale fourth alias',()=>{
 const {normalizeAttributePayload}=loadSourceBindings('frontend/src/utils/attributeApi.js',['normalizeAttributePayload'],{normalizeLocalizedName,toTrimmedText:value=>String(value??'').trim()});
 const result=normalizeAttributePayload({categories:[{id:4,code:'CAT',name:'Old alias',nameEn:'',nameKo:'새 이름',nameVi:''}]});
 assert.equal(result.categories[0].name,'새 이름');assert.equal(result.categories[0].nameEn,'새 이름');assert.equal(result.categories[0].nameVi,'');
 const empty=normalizeAttributePayload({categories:[{name:'Old alias',nameEn:'',nameKo:'',nameVi:''}]});
 assert.equal(empty.categories[0].name,'');
});
test('process composition and sorting fall back to English when optional translations are empty',()=>{
 const source=loadSourceBindings('frontend/src/pages/App/style/styleDetail/StyleProcess.jsx',['resolveProcessMasterSortLabel','resolveProcessCompositionText']);
 const entry={id:2,nameEn:'Sew',nameKo:'',nameVi:'',label:'Sew'};
 for(const language of ['ko','en','vi']){
  assert.equal(source.resolveProcessMasterSortLabel(entry,language),'Sew');assert.equal(source.resolveProcessCompositionText(entry,language),'Sew');
 }
 const backendSource=loadSourceBindings('backend/src/index.ts',['resolveStyleProcessCompositionText'],{resolveOptionalString:(value,fallback)=>typeof value==='string'&&value.trim()?value.trim():fallback});
 for(const language of ['ko','en','vi'])assert.equal(backendSource.resolveStyleProcessCompositionText(entry,language),'Sew');
});
test('attribute and process master API name aliases track English without filling missing translations',()=>{
 const source=loadSourceBindings('backend/src/index.ts',['resolveManagedAttributeNameData','resolveProcessMasterNameData'],{normalizeLocalizedName:backend.normalizeLocalizedName,normalizeProcessMasterLabel:value=>typeof value==='string'?value.trim():''});
 const value={name:'Stale fourth name',label:'Stale fourth label',nameEn:'',nameKo:'한국어만',nameVi:''};
 const attribute=source.resolveManagedAttributeNameData(value),process=source.resolveProcessMasterNameData(value);
 assert.equal(attribute.name,'한국어만');assert.equal(attribute.nameEn,'한국어만');assert.equal(attribute.nameVi,'');
 assert.equal(process.label,'한국어만');assert.equal(process.nameEn,'한국어만');assert.equal(process.nameVi,'');
});
