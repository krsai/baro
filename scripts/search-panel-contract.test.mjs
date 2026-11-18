import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{parse}=require('../frontend/node_modules/@babel/parser');
const panels=[];
function visit(node,fn){if(!node||typeof node!=='object')return;fn(node);for(const [key,value]of Object.entries(node)){if(key==='loc')continue;if(Array.isArray(value))value.forEach(child=>visit(child,fn));else if(value&&typeof value==='object')visit(value,fn);}}
function scan(dir){for(const item of readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())scan(file);else if(file.endsWith('.jsx')){const source=readFileSync(file,'utf8');if(!source.includes('<SearchPanel'))continue;visit(parse(source,{sourceType:'module',plugins:['jsx']}),node=>{if(node.type==='JSXOpeningElement'&&node.name?.name==='SearchPanel')panels.push({file,line:node.loc.start.line,attributes:new Map(node.attributes.filter(a=>a.name).map(a=>[a.name.name,a]))});});}}}
scan('frontend/src');
test('every production search panel with criteria has a real reset handler',()=>{
 assert.ok(panels.length>=27);
 for(const {file,line,attributes}of panels)if(['search','controls','filters','dates'].some(key=>attributes.has(key)))assert.ok(attributes.has('onReset'),`${file}:${line} needs onReset`);
});
test('date controls use the shared right-hand date slot rather than general filters',()=>{
 let dates=0;
 for(const {file,line,attributes}of panels){if(attributes.has('dates'))dates++;for(const key of ['search','controls','filters','actions'])visit(attributes.get(key)?.value,node=>{
  if(node.type!=='JSXOpeningElement')return;
  const isDate=/^(DateRangeSelector|MonthRangeSelector|CustomDatePicker)$/.test(node.name?.name)||node.attributes.some(a=>a.name?.name==='type'&&['date','month'].includes(a.value?.value));
  assert.ok(!isDate,`${file}:${line} has a date in ${key}; use dates`);
 });}
 assert.ok(dates>=12);
});
