import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {correctUiCopy} from './ui-copy-spacing-rules.mjs';
const require=createRequire(import.meta.url),{parse}=require('../frontend/node_modules/@babel/parser'),traverse=require('../frontend/node_modules/@babel/traverse').default;
const errors=[];let files=0;
function visit(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){
 const file=path.join(directory,entry.name);if(entry.isDirectory()){visit(file);continue;}if(!/\.(jsx|js|mjs)$/.test(file))continue;
 const source=readFileSync(file,'utf8');let ast;try{ast=parse(source,{sourceType:'module',plugins:['jsx']});}catch(error){errors.push(file+': '+error.message);continue;}files++;
 const report=(node,message)=>errors.push(`${file}:${node.loc.start.line} ${message}`);
 traverse(ast,{
  ImportDeclaration({node}){if(!file.endsWith('NotificationToast.jsx')&&(node.source.value==='@mui/material/Alert'||node.source.value==='@mui/material'&&node.specifiers.some(spec=>spec.imported?.name==='Alert')))report(node,'Use AppNotice; only NotificationToast renders the MUI alert.');},
  CallExpression({node}){if(node.callee.type==='MemberExpression'&&node.callee.object.name==='window'&&node.callee.property.name==='alert')report(node,'Use the global toast for notifications.');},
  StringLiteral({node,parent}){if(parent.type==='ImportDeclaration'||parent.key===node&&!parent.computed)return;if(correctUiCopy(node.value)!==node.value)report(node,'Correct source-copy spacing.');},
  JSXText({node}){if(correctUiCopy(node.value)!==node.value)report(node,'Correct JSX copy spacing.');},
  TemplateElement({node}){if(correctUiCopy(node.value.raw)!==node.value.raw)report(node,'Correct template copy spacing.');},
 });
}}
visit('frontend/src');
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`Global notice and copy audit passed: ${files} source files.`);
