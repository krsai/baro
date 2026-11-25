import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url), ts=require('../backend/node_modules/typescript'), frontend=createRequire(new URL('../frontend/package.json',import.meta.url)), React=frontend('react'), {renderToStaticMarkup}=frontend('react-dom/server');
const source=ts.transpileModule(readFileSync('frontend/src/components/PageActions.jsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const module={exports:{}};
vm.runInNewContext(source,{module,exports:module.exports,require:name=>name==='react'?React:name==='@mui/material'?{Box:({children})=>React.createElement('div',null,children)}:{ui:{layout:{actionGap:1}}}});
const PageActions=module.exports.default;
test('fragment primary actions mark the final button and preserve disabled state and handlers',()=>{
 let invoked=0;
 const primary=React.createElement(React.Fragment,null,React.createElement('button',null,'Preview'),React.createElement(React.Fragment,null,React.createElement('button',{disabled:true,onClick:()=>invoked++},'Save')));
 const markup=renderToStaticMarkup(React.createElement(PageActions,{primary,secondary:React.createElement('button',null,'Cancel')}));
 assert.equal((markup.match(/data-page-primary/g)||[]).length,1);
 assert.match(markup,/<button disabled="" data-page-primary="true">Save/);
 assert.ok(markup.indexOf('Cancel')<markup.indexOf('Preview'));assert.equal(invoked,0);
});
