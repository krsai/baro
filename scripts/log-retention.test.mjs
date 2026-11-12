import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {scanDevelopmentLogs,planLogCleanup,cleanDevelopmentLogs,collectDevelopmentLogs,rootDevelopmentLogs,LOG_LIMITS} from './collect-logs.mjs';

const now=Date.UTC(2026,10,8);
function fixture(t){const parent=path.resolve(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'baro-log-retention-'));t.after(()=>{assert.equal(path.dirname(path.resolve(root)),parent);assert.ok(path.basename(root).startsWith('baro-log-retention-'));fs.rmSync(root,{recursive:true,force:true});});return root;}
function write(root,name,content='log',age=0){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);fs.utimesSync(file,new Date(now-age),new Date(now-age));return file;}

test('location check detects root logs and rotated logs without moving or deleting files',t=>{
 const root=fixture(t);write(root,'build.log','build');write(root,'failure.log.1','failure');write(root,'UPPER.LOG','upper');
 for(const name of ['logs/kept.log','backups/original.log','backend/runtime.log','review.json','README.md'])write(root,name,'preserve');
 assert.deepEqual(rootDevelopmentLogs(root),['UPPER.LOG','build.log','failure.log.1']);
 assert.equal(fs.readFileSync(path.join(root,'build.log'),'utf8'),'build');
 const result=collectDevelopmentLogs(root);assert.equal(result.moved,3);assert.deepEqual(rootDevelopmentLogs(root),[]);
 for(const name of ['logs/build.log','logs/failure.log.1','logs/UPPER.LOG','logs/kept.log','backups/original.log','backend/runtime.log','review.json','README.md'])assert.ok(fs.existsSync(path.join(root,name)));
});

test('retention enforces age and count while preserving investigation data, source and backup files',t=>{
 const root=fixture(t);for(let i=0;i<25;i++)write(root,`logs/check-${i}.log`,'x',i*1000);
 write(root,'old.log.1','old',15*86400000);
 for(const file of ['logs/README.md','logs/receipt.json','logs/review.cjs','logs/backups/original.log','backups/keep.log','backend/runtime.log'])write(root,file,'preserve');
 const before=scanDevelopmentLogs(root);assert.equal(before.length,26);
 const planned=planLogCleanup(root,{now});assert.equal(planned.keep.length,LOG_LIMITS.maxFiles);assert.equal(planned.remove.length,6);
 assert.equal(cleanDevelopmentLogs(root,{now,dryRun:true}).removed,0);assert.equal(scanDevelopmentLogs(root).length,26);
 const result=cleanDevelopmentLogs(root,{now});assert.equal(result.removed,6);assert.deepEqual(result.failures,[]);assert.equal(scanDevelopmentLogs(root).length,20);
 for(const file of ['logs/README.md','logs/receipt.json','logs/review.cjs','logs/backups/original.log','backups/keep.log','backend/runtime.log'])assert.equal(fs.readFileSync(path.join(root,file),'utf8'),'preserve');
});

test('byte cap is cumulative and rejects oversized logs without truncating other files',t=>{
 const root=fixture(t);write(root,'logs/huge.log','x'.repeat(101));write(root,'a.log','a'.repeat(60),1000);write(root,'b.log','b'.repeat(50),2000);
 const plan=planLogCleanup(root,{now,maxBytes:100});assert.equal(plan.keep.length,1);assert.equal(path.basename(plan.keep[0].file),'a.log');
 assert.throws(()=>planLogCleanup(root,{maxFiles:-1}),/Invalid/);
 const result=cleanDevelopmentLogs(root,{all:true});assert.equal(result.removed,3);assert.equal(result.removedBytes,211);
});

test('collection keeps the newest same-name file and never creates numbered copies',t=>{
 const root=fixture(t);write(root,'logs/build.log','old',2000);write(root,'build.log','new',1000);
 assert.equal(collectDevelopmentLogs(root).moved,1);assert.equal(fs.readFileSync(path.join(root,'logs/build.log'),'utf8'),'new');
 write(root,'build.log','older',3000);assert.equal(collectDevelopmentLogs(root).discardedOlder,1);
 assert.equal(fs.readFileSync(path.join(root,'logs/build.log'),'utf8'),'new');assert.equal(scanDevelopmentLogs(root).length,1);
 collectDevelopmentLogs(root);assert.deepEqual(fs.readdirSync(path.join(root,'logs')),['build.log']);
});

test('cleanup never follows a directory link outside the workspace',t=>{
 const root=fixture(t),outside=fixture(t);write(outside,'external.log','original');fs.mkdirSync(path.join(root,'logs'));
 try{fs.symlinkSync(outside,path.join(root,'logs','linked'),process.platform==='win32'?'junction':'dir');}catch(error){if(['EPERM','EACCES'].includes(error.code)){t.skip('OS does not permit directory links');return;}throw error;}
 assert.equal(scanDevelopmentLogs(root).length,0);assert.equal(cleanDevelopmentLogs(root,{all:true}).removed,0);
 assert.equal(fs.readFileSync(path.join(outside,'external.log'),'utf8'),'original');
 const linkedRoot=fixture(t);write(linkedRoot,'build.log','inside');
 fs.symlinkSync(outside,path.join(linkedRoot,'logs'),process.platform==='win32'?'junction':'dir');
 assert.throws(()=>collectDevelopmentLogs(linkedRoot),/linked log directory/);
 assert.equal(fs.readFileSync(path.join(outside,'external.log'),'utf8'),'original');
});
