import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {transformSync}=require('../frontend/node_modules/esbuild');
const source=readFileSync(new URL('../frontend/src/index.jsx',import.meta.url),'utf8');
const startup=source.slice(source.indexOf('const canonicalOrigin = resolveCanonicalOrigin();'));

for(const {origin,canonical,production,redirects,renders} of [
 {origin:'https://barogarment.com',canonical:'https://www.barogarment.com',production:true,redirects:1,renders:0},
 {origin:'https://www.barogarment.com',canonical:'https://www.barogarment.com',production:true,redirects:0,renders:1},
 {origin:'http://localhost:5173',canonical:'https://www.barogarment.com',production:false,redirects:0,renders:1},
 {origin:'https://barogarment.com',canonical:'',production:true,redirects:0,renders:1},
]) test(`startup on ${origin} (${production?'production':'development'}, canonical=${canonical || 'unset'})`,()=>{
 const destinations=[],mounted=[];
 const code=transformSync(startup.replaceAll('import.meta.env.PROD',String(production)),{loader:'jsx'}).code;
 vm.runInNewContext(code,{
  resolveCanonicalOrigin:()=>canonical,
  window:{location:{origin,pathname:'/outsourcing-record',search:'?month=2026-10',hash:'#detail',replace:value=>destinations.push(value)}},
  document:{getElementById:()=>({})},
  ReactDOM:{createRoot:()=>{mounted.push(true);return {render:()=>{}};}},
  React:{StrictMode:'strict',createElement:()=>({})},App:()=>{},
 });
 assert.equal(destinations.length,redirects);
 assert.equal(mounted.length,renders,'Never mount the default-language app before an origin redirect');
 if(redirects)assert.equal(destinations[0],`${canonical}/outsourcing-record?month=2026-10#detail`);
});
