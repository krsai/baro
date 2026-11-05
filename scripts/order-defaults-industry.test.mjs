import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasApparelBrandIndustry} from '../frontend/src/utils/orderDefaultsIndustry.mjs';
const classification=(name,selected=true)=>({roleIds:[1],industryIds:selected?[2]:[],industries:[{id:2,partnerRoleId:1,nameKo:name}]});
test('only selected apparel brand industry enables order defaults',()=>{
 assert.equal(hasApparelBrandIndustry(classification('의류 브랜드')),true);
 assert.equal(hasApparelBrandIndustry(classification('의류 제조업')),false);
 assert.equal(hasApparelBrandIndustry(classification('물류 서비스')),false);
 assert.equal(hasApparelBrandIndustry(classification('의류 브랜드',false)),false);
 assert.equal(hasApparelBrandIndustry({...classification('의류 브랜드'),roleIds:[]}),false);
 assert.equal(hasApparelBrandIndustry(),false);
});
test('localized industry names and multiple selected industries work without legacy organization types',()=>{
 for(const name of ['Clothing brand','Apparel brand','Thương hiệu thời trang'])assert.equal(hasApparelBrandIndustry(classification(name)),true);
 const mixed=classification('의류 제조업');mixed.industryIds.push(3);mixed.industries.push({id:3,partnerRoleId:1,nameKo:'의류 브랜드'});
 assert.equal(hasApparelBrandIndustry(mixed),true);
 assert.equal(hasApparelBrandIndustry({industry:'BRAND',roleIds:[],industryIds:[],industries:[]}),false);
});
