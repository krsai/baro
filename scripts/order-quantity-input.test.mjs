import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSourceBindings} from './helpers/source-bindings.mjs';
const source='frontend/src/pages/App/order/OrderList.jsx';
const gender=(v,f='')=>['M','F','U'].includes(v)?v:f;
const helpers=loadSourceBindings(source,['getStyleIdentity','normalizeColorCode','normalizeColorNameKey','toPositiveColorId','getItemColorIdentity','getStyleColorGenderKey','hasDuplicateStyleColorGender','toNumericInputString'],{normalizeGenderCode:gender});
const normalize=values=>({XS:'',S:'',M:'',...values});
const row=(id,styleId,colorId,genderCode='',qty={})=>({id,styleId,colorId,colorCode:'C'+colorId,gender:genderCode,sizeQuantities:normalize(qty),sizeSetCode:'LEGACY_APPAREL'});
function harness(items){
 let state={items},notices=[];let counter=0;
 const groups=()=>state.items.map(item=>({styleId:item.styleId,rows:[{item,isColorFirstRow:true,colorRowItemIds:[item.id]}]}));
 const deps=()=>({...helpers,normalizeGenderCode:gender,normalizeSizeKey:v=>['XS','S','M'].includes(v)?v:'',currentSizeSetCode:'LEGACY_APPAREL',normalizeSizeQuantities:normalize,hasAnySizeQuantity:q=>Object.values(q).some(v=>Number(v)>0),createSizeQuantities:()=>normalize({}),createId:()=>`new-${++counter}`,formData:state,setFormData:update=>{state=update(state)},showNotification:(message,tone)=>notices.push([message,tone]),orderPageText:{duplicateStyleColorGender:'duplicate'},useMemo:fn=>fn(),groupedStyleItems:groups(),getResolvedColorLabel:()=>'',currentHorizontalGenderCodes:['M','F','U'],currentSizeColumns:['XS','S','M']});
 const views=()=>loadSourceBindings(source,['horizontalStyleColorRows'],deps()).horizontalStyleColorRows;
 return {get state(){return state},notices,views,type(index,g,size,value){const group=views()[index],color=group.colorRows[0];loadSourceBindings(source,['handleHorizontalSizeQuantityChange'],deps()).handleHorizontalSizeQuantityChange(group,color,g,size,value)}};
}
test('new style quantities choose the typed gender and persist successive digits',()=>{
 const h=harness([row('saved',1,1,'F',{S:'20'}),row('draft',2,2)]);
 assert.equal(h.views()[1].colorRows[0].itemByGender.U,null);
 h.type(1,'F','S','1');h.type(1,'F','S','12');assert.equal(h.state.items[1].gender,'F');assert.equal(h.state.items[1].sizeQuantities.S,'12');assert.equal(h.state.items[0].sizeQuantities.S,'20');assert.deepEqual(h.notices,[]);
});
test('one new color can hold male female and unisex quantities without retagging another row',()=>{
 const h=harness([row('draft',2,2)]);h.type(0,'M','S','15');h.type(0,'F','M','20');assert.equal(h.state.items.length,2);assert.equal(h.state.items[0].gender,'M');assert.equal(h.state.items[0].sizeQuantities.S,'15');assert.equal(h.state.items[1].gender,'F');assert.equal(h.state.items[1].sizeQuantities.M,'20');h.type(0,'U','XS','3');assert.equal(h.state.items[2].gender,'U');assert.equal(h.state.items[2].sizeQuantities.XS,'3');
});
test('existing zero-quantity gender rows retain their identity when another gender is added',()=>{
 const h=harness([row('saved',2,2,'M')]);h.type(0,'F','S','8');assert.equal(h.state.items[0].id,'saved');assert.equal(h.state.items[0].gender,'M');assert.equal(h.state.items[1].gender,'F');
});
test('same style/color/gender reports a conflict; a different gender on the new row remains editable',()=>{
 const h=harness([row('saved',1,1,'F',{S:'20'}),row('draft',1,1)]);h.type(1,'F','S','5');assert.deepEqual(h.notices,[['duplicate','warning']]);assert.equal(h.state.items[0].sizeQuantities.S,'20');h.type(1,'M','M','7');assert.equal(h.state.items[1].gender,'M');assert.equal(h.state.items[1].sizeQuantities.M,'7');
});

