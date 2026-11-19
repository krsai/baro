import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const {parse}=require('@babel/parser'),traverse=require('@babel/traverse').default;
test('all JSX component names resolve to a local or imported binding',()=>{
 const missing=[];
 function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const file=dir+'/'+e.name;if(e.isDirectory())walk(file);else if(/\.[jt]sx?$/.test(file)){
 const ast=parse(readFileSync(file,'utf8'),{sourceType:'module',plugins:['jsx','typescript']});
 traverse(ast,{JSXOpeningElement(path){const name=path.node.name;if(name.type==='JSXIdentifier'&&/^[A-Z]/.test(name.name)&&!path.scope.hasBinding(name.name))missing.push(file+':'+name.loc.start.line+' '+name.name);}});
 }}}
 walk('frontend/src');assert.deepEqual(missing,[]);
});
