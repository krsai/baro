import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{parse}=require('../frontend/node_modules/@babel/parser'),traverse=require('../frontend/node_modules/@babel/traverse').default;
const roles=new Set(['records','review','summary','lookup','entry','matrix','document']);
test('all tables declare their role; ordinary rows have plain text, a final shared action cell and status first',()=>{
 const failures=[],inventory={};
 function scan(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);if(entry.isDirectory()){scan(file);continue;}if(!file.endsWith('.jsx'))continue;
  const source=readFileSync(file,'utf8'),ast=parse(source,{sourceType:'module',plugins:['jsx']}),report=(node,message)=>failures.push(`${file}:${node.loc.start.line} ${message}`);
  traverse(ast,{JSXElement(p){const node=p.node,name=node.openingElement.name.name;
   if(['Table','table'].includes(name)){const role=node.openingElement.attributes.find(a=>a.name?.name==='data-table-kind')?.value?.value;if(!roles.has(role))report(node,'Declare data-table-kind.');else inventory[role]=(inventory[role]||0)+1;}
   const table=p.findParent(q=>q.isJSXElement()&&['Table','table'].includes(q.node.openingElement.name.name));
   if(name==='RecordRow'&&table){const last=node.children.filter(n=>n.type==='JSXElement').at(-1);if(last?.openingElement.name.name!=='TableActionsCell')report(node,'Use the final TableActionsCell for explicit opening and actions.');}
   if(name==='RecordOpenButton'&&table&&p.findParent(q=>q.isJSXElement()&&q.node.openingElement.name.name==='RecordRow'))report(node,'Use RecordText for body values and the shared action cell for opening.');
   if(['DeleteActionButton','ExpenseDeletionButton'].includes(name)&&table){const cell=p.findParent(q=>q.isJSXElement()&&['TableCell','td','TableActionsCell'].includes(q.node.openingElement.name.name));if(cell?.node.openingElement.name.name!=='TableActionsCell')report(node,'Keep delete controls in TableActionsCell.');}
   if(['TableCell','th'].includes(name)&&p.findParent(q=>q.isJSXElement()&&['TableHead','thead'].includes(q.node.openingElement.name.name))){const text=source.slice(node.openingElement.end,node.closingElement?.start).trim();if(/^\{\w+\.(?:remove|delete|deleteLabel|columnAction)\}$|^\{getUiMessage\(['"]common.delete['"]/.test(text))report(node,'Use the shared Actions header instead of Delete/Management.');}
  },ArrayExpression(p){if(!p.findParent(q=>q.isJSXElement()&&['TableHead','thead'].includes(q.node.openingElement.name.name)))return;
   const status=p.node.elements.findIndex(n=>n&&/^(?:\w+\.)?(?:status|invoiceStatus)$|^['"](?:status|receipt)['"]$/.test(source.slice(n.start,n.end)));
   if(status>0)report(p.node,'Put the status column first; declare specialized input roles instead of restoring old column order.');
  }});
 }}scan('frontend/src');console.log('Table roles:',JSON.stringify(inventory));assert.deepEqual(failures,[]);
});
