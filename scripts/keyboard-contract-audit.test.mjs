import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(path.resolve('frontend/package.json')),{parse}=require('@babel/parser');
const files=[];
// MUI/native controls own activation; the small wrapper list delegates to those
// controls. Everything else with a click action needs an explicit keyboard path.
const activationOwners=new Set(['button','a','input','Button','IconButton','ButtonBase','MenuItem','Chip','ListItemButton','Autocomplete','Checkbox','Radio','Switch','Tab','Tabs','ToggleButton','ToggleButtonGroup','Link','Select','TextField','SearchableSelect','PageSettingsButton','DeleteActionButton','SaveButton','AddActionButton','ColorPicker','DatePicker','CustomDatePicker','CompactBoardCard','Draggable','DashboardAlertItem','ApprovalLineSummary','ReportStatusChip','TableSortLabel']);
function collect(dir){for(const row of readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,row.name);if(row.isDirectory())collect(p);else if(/\.(js|jsx|mjs)$/.test(p))files.push(p);}}
collect('frontend/src/pages');collect('frontend/src/components');collect('frontend/src/layouts');
function walk(node,visit){if(!node||typeof node!=='object')return;visit(node);for(const [key,value]of Object.entries(node)){if(['loc','start','end'].includes(key))continue;if(Array.isArray(value))value.forEach(row=>walk(row,visit));else if(value&&typeof value==='object')walk(value,visit);}}
test('every page/component follows shared focus and single-choice declarations',()=>{
 const violations=[];let groups=0,handlers=0;
 for(const file of files){const source=readFileSync(file,'utf8'),tree=parse(source,{sourceType:'module',plugins:['jsx']});walk(tree,node=>{
  if(node.type!=='JSXOpeningElement')return;
  const attrs=node.attributes.filter(row=>row.type==='JSXAttribute'),has=key=>attrs.some(row=>row.name.name===key),value=key=>attrs.find(row=>row.name.name===key)?.value;
  const name=node.name.name,where=file+':'+node.loc.start.line;
  if(['Button','IconButton'].includes(name)&&value('component')?.value==='span'&&!has('onClick')&&!has('onKeyDown'))violations.push(where+' span button has no native action callback');
  if(name==='ToggleButtonGroup'&&has('exclusive')){groups++;if(!has('data-focus-next'))violations.push(where+' single-choice group lacks common keyboard marker');}
  // These retain keyboard actions on their child radio/button or DnD listener;
  // a row used only for highlighting must not confirm its value on focus.
  const childOwned=['LookupSearchDialog.jsx','RevenueTargetPicker.jsx','PartnerDirectory.jsx'].some(name=>file.endsWith(name));
  if(has('onContextMenu')&&['Box','TableRow','tr','Paper'].includes(name)&&!has('data-keyboard-context-menu'))violations.push(where+' pointer-only context menu');
  const component=value('component'),componentSource=component?source.slice(component.start,component.end):'';
  const nativeComponent=/ButtonBase|Button|["'](?:button|a)["']/.test(componentSource);
  if(has('onClick')&&!has('onKeyDown')&&!has('onKeyUp')&&!activationOwners.has(name)&&!nativeComponent&&!childOwned){
   const click=value('onClick')?.expression,body=click?source.slice(click.start,click.end):'';
   if(!body.includes('stopPropagation'))violations.push(where+' click-only control has no keyboard entry');
  }
  if(has('onDoubleClick')&&!has('onKeyDown')&&['TableRow','tr','Paper'].includes(name)&&!childOwned){
   const handler=value('onDoubleClick')?.expression,body=handler?source.slice(handler.start,handler.end):'';
   if(!body.includes('stopPropagation'))violations.push(where+' double-click action lacks keyboard entry');
  }
  const tab=value('tabIndex'),number=tab?.expression?.value??tab?.value;
  if(Number(number)>0)violations.push(where+' positive tabindex bypasses DOM order');
  if(has('onKeyDown')){handlers++;const handler=value('onKeyDown')?.expression;if(handler?.type==='ArrowFunctionExpression'){
   const body=source.slice(handler.start,handler.end);
   if(/\.key\s*===?\s*['"](?:Enter|Tab|Escape)['"]/.test(body)&&!body.includes('keyboardAction')&&!body.includes('activateOnKeyboard'))violations.push(where+' custom confirmation bypasses shared IME/modifier policy');
  }}
 });}
 assert.deepEqual(violations,[]);
 console.log(`Audited ${files.length} page/component modules, ${groups} exclusive groups and ${handlers} keyboard bindings.`);
 assert.match(readFileSync('frontend/src/App.jsx','utf8'),/useKeyboardNavigation\(\)/);
 assert.match(readFileSync('frontend/src/utils/documentKeyboard.mjs','utf8'),/textInputKeyDown\(event\)/);
 const assignment=readFileSync('frontend/src/pages/App/assign/hooks/useAssignBoardDnd.js','utf8');
 assert.match(assignment,/useSensor\(KeyboardSensor/,'assignment moves need a keyboard sensor as well as pointer input');
 assert.match(readFileSync('frontend/src/pages/App/assign/AssignBoard.jsx','utf8'),/assignmentCollisionDetection/,'keyboard moves need non-pointer collision detection');
});
