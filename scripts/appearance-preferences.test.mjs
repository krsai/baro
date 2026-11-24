import test from 'node:test';
import assert from 'node:assert/strict';
import {appearanceKey,readAppearance,writeAppearance,subscribeAppearance} from '../frontend/src/theme/appearancePreferences.mjs';
test('appearance defaults safely, persists per user/company and keeps other personal settings independent',()=>{
 const prior=globalThis.window,values=new Map();globalThis.window=new EventTarget();window.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 try{
  const a=appearanceKey({orgId:7,email:'one@example.test'}),b=appearanceKey({orgId:8,email:'one@example.test'}),c=appearanceKey({orgId:7,email:'two@example.test'});
  const existingKey=a.slice(0,-':appearance'.length),existing='{"openDashboardOnLogin":true}';values.set(existingKey,existing);
  let events=0;const stop=subscribeAppearance(()=>events++);
  assert.equal(readAppearance(a),'standard');writeAppearance(a,'compact');assert.equal(readAppearance(a),'compact');assert.equal(events,1);
  assert.equal(readAppearance(b),'standard');assert.equal(readAppearance(c),'standard');assert.equal(values.size,2);assert.equal(values.get(existingKey),existing);
  writeAppearance(a,'invalid');assert.equal(readAppearance(a),'standard');stop();writeAppearance(a,'compact');assert.equal(events,2);
  window.localStorage.setItem=()=>{throw Error('Unavailable');};writeAppearance(b,'compact');assert.equal(readAppearance(b),'compact');assert.equal(readAppearance(c),'standard');
 }finally{globalThis.window=prior;}
});
