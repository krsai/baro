import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {registerInventoryMovementRoutes}=require('../backend/dist/services/inventoryMovements');
test('new stock options ignore saved LWH requirement and preserve historical variant dimensions',async()=>{
 const routes=new Map(),historical=[{id:'old',attributes:{dimensions:{length:'1',width:'2',height:'3'}}}];
 const base={id:7,requiredFields:['length','width'],materialSettings:{enabled:true,masterInputs:{dimensions:'REQUIRED',type:'HIDDEN',color:'REQUIRED'}}};
 const db={materialItem:{findFirst:async({where})=>{assert.deepEqual(where,{id:'master',orgId:4});return {id:'master',baseId:7};}},transactionCodeBase:{findFirst:async()=>base},$queryRaw:async()=>historical,organization:{findMany:async()=>[]},attrColor:{findMany:async()=>[]}};
 registerInventoryMovementRoutes({get:(path,handler)=>routes.set(path,handler),post:()=>{}},db,async()=>({orgId:4}));
 let result;await routes.get('/inventory-entry/options')({query:{masterId:'master'}},{json:value=>result=value});
 assert.equal(result.fields.dimensions,false);assert.equal(result.fields.color,'REQUIRED');assert.equal(result.fields.type,'HIDDEN');assert.deepEqual(result.variants,historical);
});
