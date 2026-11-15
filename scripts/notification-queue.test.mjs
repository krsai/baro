import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotificationQueue,TOAST_DURATION} from '../frontend/src/utils/notificationQueue.mjs';
import {correctUiCopy} from './ui-copy-spacing-rules.mjs';

test('global queue retains simultaneous notices, deduplicates visible sources and removes stale actions',()=>{
 let current,timer;const queue=createNotificationQueue(value=>{current=value;},{schedule:fn=>{timer=fn;return 1;},cancel:()=>{timer=null;}});
 queue.show('Warning','warning',{source:'a',dedupeKey:'warning'});
 queue.show('Warning','warning',{source:'b',dedupeKey:'warning'});
 queue.remove('a');assert.equal(current.message,'Warning');
 queue.show('Error','error',{source:'c',action:{retry:true}});queue.dismiss();
 assert.equal(current.message,'Error');assert.equal(timer,null,'retry stays available until acted on or dismissed');
 queue.remove('c');assert.equal(current,null);
 queue.show('Saved','success');assert.equal(TOAST_DURATION.success,3000);
 timer();assert.equal(current,null);
 queue.show('First','info');queue.show('Replacement','success');assert.equal(current.message,'Replacement');queue.dismiss();assert.equal(current,null);
 queue.dispose();
});
test('source-copy corrections preserve already correct text and do not remove meaningful spaces',()=>{
 assert.equal(correctUiCopy('변경사항을 저장해주세요.'),'변경 사항을 저장해 주세요.');
 assert.equal(correctUiCopy('한 번에 저장해 주세요.'),'한 번에 저장해 주세요.');
 assert.equal(correctUiCopy('Company name · Tên công ty'),'Company name · Tên công ty');
});
