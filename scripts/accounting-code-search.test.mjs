import test from 'node:test';
import assert from 'node:assert/strict';
import {accountingCodeSearchValues} from '../frontend/src/utils/accountingCode.mjs';
import {normalizeLookupText,resolveLookupOption} from '../frontend/src/utils/expenseLookup.mjs';

test('accounting search includes registered base names in all languages and keeps tax variant IDs distinct',()=>{
 const base={code:'TIS',nameKo:'방습지',nameEn:'Tissue Paper',nameVi:'Giấy Lót'};
 const exempt={id:10,code:'TISE',nameEn:'Exempt',base},vat={id:11,code:'TISV',nameEn:'VAT',base};
 const options=[exempt,vat],config={getLabel:row=>row.code,getValues:accountingCodeSearchValues};
 for(const query of ['tissue','TISSUE','방습지','giay lot','Giấy Lót']){
  assert.deepEqual(options.filter(row=>normalizeLookupText(accountingCodeSearchValues(row).join(' ')).includes(normalizeLookupText(query))).map(row=>row.id),[10,11]);
 }
 assert.equal(resolveLookupOption(options,'Tissue Paper',config),null,'Two tax variants must require explicit selection');
 assert.equal(resolveLookupOption([exempt],'tissue',config),null,'Even one partial result must open the search dialog');
 assert.equal(resolveLookupOption([exempt],'TIS',config),null,'A base prefix must not silently select a tax variant');
 assert.equal(resolveLookupOption([exempt],'Tissue Paper',config),exempt);
 assert.equal(resolveLookupOption(options,'TISE',config),exempt);
 assert.equal(resolveLookupOption(options,'TISV',config),vat);
 assert.equal(resolveLookupOption(options,'방습지',config),null);
 assert.deepEqual(base,{code:'TIS',nameKo:'방습지',nameEn:'Tissue Paper',nameVi:'Giấy Lót'});
});
