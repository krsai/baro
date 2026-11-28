import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const script=path.resolve('scripts/check-encoding.mjs');
function fixture(work){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'baro-encoding-')),files=new Set(),dirs=new Set([root]);
 const write=(relative,content)=>{
  const file=path.resolve(root,relative);assert.ok(file.startsWith(root+path.sep));
  const missing=[];for(let dir=path.dirname(file);!fs.existsSync(dir);dir=path.dirname(dir))missing.push(dir);
  for(const dir of missing.reverse()){fs.mkdirSync(dir);dirs.add(dir);}
  fs.writeFileSync(file,content);files.add(file);
 };
 const check=()=>{const result=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8'});return {status:result.status,output:(result.stdout+result.stderr).replaceAll('\\','/')};};
 try{work(write,check);}finally{
  for(const file of files)fs.unlinkSync(file);
  for(const dir of [...dirs].sort((a,b)=>b.length-a.length))fs.rmdirSync(dir);
 }
}
test('finds root and nested Markdown without a fixed filename list or search ignore rules',()=>fixture((write,check)=>{
 write('.gitignore','*.md\n');write('todo.md','Valid status\n');write('docs/new-guide.md','Broken ?? ?? prose\n');
 let result=check();assert.equal(result.status,1);assert.match(result.output,/docs\/new-guide.md:1/);
 write('docs/new-guide.md','Valid guide\n');write('todo.md','Broken ??? status\n');result=check();assert.equal(result.status,1);assert.match(result.output,/todo.md:1/);
}));
test('accepts nullish operators and skips dependency/generated docs while rejecting invalid text bytes',()=>fixture((write,check)=>{
 write('README.md','Example: value ?? fallback\n');write('docs/notes.MD','Another ?? example\n');write('node_modules/dependency/README.md','Broken ??? vendor text\n');write('frontend/dist/README.md','Broken ??? build output\n');assert.equal(check().status,0);
 write('docs/notes.MD',Buffer.from([0xff]));let result=check();assert.equal(result.status,1);assert.match(result.output,/U\+FFFD/);
 write('docs/notes.MD','Valid guide\n');write('backend/src/example.ts',Buffer.from([0x61,0,0x62]));result=check();assert.equal(result.status,1);assert.match(result.output,/NUL character/);
}));
test('preserves damaged historical bytes only with a valid original checksum and still checks visible prose',()=>fixture((write,check)=>{
 const bytes=Buffer.from('Original damaged ??? text\n'),archive={kind:'preserved-source',sourcePath:'docs/old.md',sourceCommit:'historical',normalization:'LF',sha256:createHash('sha256').update(bytes).digest('hex'),contentBase64:bytes.toString('base64')};
 write('docs/domain-reference.md','Readable explanation; historical result remains unverified.\n');write('docs/originals/old.source.json',JSON.stringify(archive));assert.equal(check().status,0);
 write('docs/originals/old.source.json',JSON.stringify({...archive,sha256:'0'.repeat(64)}));let result=check();assert.equal(result.status,1);assert.match(result.output,/checksum/);
 write('docs/originals/old.source.json',JSON.stringify(archive));write('docs/domain-reference.md','Broken ??? visible text\n');assert.equal(check().status,1);
}));
