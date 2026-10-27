import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const load=()=>require('../backend/dist/services/missingProcessRecords.js').missingProcessRecords;
const row=(id,quantity,target=170)=>({styleProcessId:id,processCode:id===3?'C01':`P${id}`,applicableQuantity:target,quantity});
const options={completed:false,invalidReferences:false};
test('L17-1 AM02058-like isolated empty process is flagged without changing any data',()=>{
 const rows=[row(1,170),row(2,170),row(3,0),row(4,170),row(5,180)];const before=JSON.stringify(rows);
 assert.deepEqual(load()(rows,options),[{styleProcessId:3,processCode:'C01',processName:undefined,targetQuantity:170,recordedQuantity:0}]);
 assert.equal(JSON.stringify(rows),before);
 rows[2].quantity=170;assert.deepEqual(load()(rows,options),[]);
});
test('ordinary ongoing work, partial gaps, unknown FKs and historical/approved completion are excluded',()=>{
 for(const rows of [[row(1,0),row(2,0),row(3,0)],[row(1,170),row(2,0),row(3,0)],[row(1,170),row(2,160),row(3,0)],[row(1,170),row(2,170),{...row(3,0),styleProcessId:null}]])assert.deepEqual(load()(rows,options),[]);
 const rows=[row(1,170),row(2,170),row(3,0)];
 assert.deepEqual(load()(rows,{...options,completed:true}),[]);assert.deepEqual(load()(rows,{...options,invalidReferences:true}),[]);
});
test('gender-specific targets and inapplicable zero targets are honored; several isolated gaps may be reviewed',()=>{
 assert.equal(load()([row(1,100,100),row(2,70,70),row(3,0,170),row(4,0,0)],options).length,1);
 assert.equal(load()([row(1,170),row(2,170),row(3,170),row(4,0),row(5,0)],options).length,2);
});
