import test from 'node:test';
import assert from 'node:assert/strict';
import {workRouteSteps} from '../frontend/src/utils/shippingWorkPresentation.mjs';

test('work route follows the saved 2/3/4-node scope and keeps actual terminal and door identities',()=>{
 const data={origin:'Factory',destination:'Buyer',originPortCode:'VNHPH',destinationPortCode:'KRINC',routeLocations:{ORIGIN_DOOR:'Factory',ORIGIN_TERMINAL:'Haiphong (VNHPH)',DESTINATION_TERMINAL:'Incheon (KRINC)',DESTINATION_DOOR:'Buyer'}};
 const nodes=['ORIGIN_DOOR','ORIGIN_TERMINAL','DESTINATION_TERMINAL','DESTINATION_DOOR'];
 for(const [start,end] of [[0,3],[0,2],[1,3],[1,2]]){
  const job={mode:'SEA',data:{...data,workScope:{start:nodes[start],end:nodes[end]}}},before=structuredClone(job),steps=workRouteSteps(job);
  assert.deepEqual(steps.map(row=>row.node),nodes.slice(start,end+1));
  assert.equal(steps[0].field,'origin');assert.equal(steps.at(-1).field,'destination');assert.ok(steps.slice(1,-1).every(row=>row.field===null));
  assert.deepEqual(steps.map(row=>row.value),nodes.slice(start,end+1).map(node=>data.routeLocations[node]));assert.deepEqual(job,before);
 }
});

test('legacy records show only saved terminals, and road/express always use two door endpoints',()=>{
 const data={origin:'Factory',destination:'Buyer'};
 assert.equal(workRouteSteps({mode:'SEA',data}).length,2);
 assert.equal(workRouteSteps({mode:'SEA',data:{...data,originPortCode:'VNHPH'}}).length,3);
 assert.equal(workRouteSteps({mode:'SEA',data:{...data,originPortCode:'VNHPH',destinationPortCode:'KRINC'}}).length,4);
 for(const job of [{mode:'ROAD',data},{mode:'AIR',service:'EXPRESS',data}])assert.deepEqual(workRouteSteps(job).map(row=>row.node),['ORIGIN_DOOR','DESTINATION_DOOR']);
 assert.deepEqual(workRouteSteps({mode:'AIR',data:{...data,workScope:{start:'ORIGIN_TERMINAL',end:'DESTINATION_TERMINAL'}}}).map(row=>row.label),['originAirport','destinationAirport']);
});
