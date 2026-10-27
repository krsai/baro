import test from 'node:test';
import assert from 'node:assert/strict';
import {reorderOrderColorItems} from '../frontend/src/utils/orderColorOrder.mjs';
import {loadSourceBindings} from './helpers/source-bindings.mjs';
const items=['red-m','red-f','blue-m','blue-f','other'].map(id=>({id,sizeQuantities:{S:10}}));
test('color move carries every gender and retains original objects and quantities',()=>{
 const result=reorderOrderColorItems(items,items.slice(0,4).map(row=>row.id),['red-m','red-f'],['blue-m','blue-f']);
 assert.deepEqual(result.map(row=>row.id),['blue-m','blue-f','red-m','red-f','other']);
 assert.equal(result[0],items[2]);assert.equal(result[4],items[4]);assert.deepEqual(items[0].sizeQuantities,{S:10});
 assert.deepEqual(reorderOrderColorItems(result,result.slice(0,4).map(row=>row.id),['red-m','red-f'],['blue-m','blue-f']),items);
});
test('style move preserves its colors and rejects missing or overlapping targets',()=>{
 const ids=items.map(row=>row.id),style=ids.slice(0,4);
 assert.deepEqual(reorderOrderColorItems(items,ids,style,['other']).map(row=>row.id),['other',...style]);
 assert.equal(reorderOrderColorItems(items,ids,['red-m'],['red-m']),items);
 assert.equal(reorderOrderColorItems(items,ids,['missing'],['other']),items);
});

test('drag handler refuses cross-style color moves and locked/saving orders',()=>{
 for(const [locked,saving,from,to] of [[false,false,'a','b'],[true,false,'a','a'],[false,true,'a','a']]){
  let writes=0;
  const {handleOrderDragEnd}=loadSourceBindings('frontend/src/pages/App/order/OrderList.jsx',['handleOrderDragEnd'],{
   isCurrentOrderModificationLocked:locked,isSavingOrder:saving,groupedStyleItems:[],
   setFormData:()=>writes++,setDeferredMergeRowIds:()=>writes++,reorderOrderColorItems,
  });
  handleOrderDragEnd({active:{data:{current:{kind:'color',styleKey:from,ids:['red-m']}}},over:{data:{current:{styleKey:to,ids:['blue-m']}}}});
  assert.equal(writes,0);
 }
});
