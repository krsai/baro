import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{parse}=require('../frontend/node_modules/@babel/parser'),traverse=require('../frontend/node_modules/@babel/traverse').default;
export function auditUi(root='frontend/src'){
 const result={files:0,tables:0,sharedStatusRows:0,sharedPagination:0,inlinePagination:[],inlineStatusRows:[],nativeSelects:[],muiAutocomplete:[],nativeDialogs:[],rawAlerts:[],dialogsWithoutActions:[]};
 function visit(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name).replaceAll('\\','/');if(entry.isDirectory()){visit(file);continue;}if(!file.endsWith('.jsx'))continue;
  const source=readFileSync(file,'utf8'),ast=parse(source,{sourceType:'module',plugins:['jsx']});result.files++;
  const rawAutocomplete=new Set(ast.program.body.filter(n=>n.type==='ImportDeclaration'&&n.source.value.startsWith('@mui/material')).flatMap(n=>n.specifiers.filter(s=>s.imported?.name==='Autocomplete'||n.source.value.endsWith('/Autocomplete')).map(s=>s.local.name)));
  const add=(key,node,extra={})=>result[key].push({file,line:node.loc.start.line,...extra});
  traverse(ast,{
   ImportDeclaration({node}){if(file.endsWith('NotificationToast.jsx'))return;if(node.source.value==='@mui/material/Alert'||node.source.value==='@mui/material'&&node.specifiers.some(spec=>spec.imported?.name==='Alert'))add('rawAlerts',node);},
   CallExpression({node}){const c=node.callee;if(c.type==='MemberExpression'&&c.object.name==='window'&&['confirm','prompt','alert'].includes(c.property.name))add('nativeDialogs',node,{kind:c.property.name});},
   JSXElement(p){
    const n=p.node,name=n.openingElement.name.name;
    if(name==='Table')result.tables++;
    if(name==='TableStatusRow')result.sharedStatusRows++;
    if(name==='ListPagination')result.sharedPagination++;
    if(name==='select')add('nativeSelects',n);
    if(rawAutocomplete.has(name)&&!file.endsWith('/SearchableSelect.jsx'))add('muiAutocomplete',n);
    // Month navigation and version application are domain controls, not result paging.
    if(name==='Stack'&&!/\/(ListPagination|MonthSelector|MonthRangeSelector|VersionApplicationStart)\.jsx$/.test(file)){
     const buttons=n.children.filter(child=>child.type==='JSXElement'&&child.openingElement.name.name==='Button');
     if(buttons.length===2&&buttons.every(button=>button.openingElement.attributes.some(a=>a.name?.name==='disabled'))&&/prev|previous|next|이전|다음/i.test(source.slice(n.start,n.end)))add('inlinePagination',n);
    }
    if(name==='Dialog'&&!n.children.some(child=>child.type==='JSXElement'&&child.openingElement.name.name==='DialogActions'))add('dialogsWithoutActions',n);
    if(name!=='TableRow'||file.endsWith('/TableStatusRow.jsx'))return;
    const cells=n.children.filter(child=>child.type==='JSXElement');
    if(cells.length!==1||cells[0].openingElement.name.name!=='TableCell')return;
    const cell=cells[0],span=cell.openingElement.attributes.find(attr=>attr.name?.name==='colSpan');if(!span)return;
    const body=source.slice(cell.openingElement.end,cell.closingElement.start).trim();
    // Expanded business forms and field-specific validation are not query status.
    if(/<(?:Table\b|Collapse\b)/.test(body)||n.openingElement.attributes.some(attr=>attr.name?.name==='data-ledger-row-error')||body==="{tab==='accounts'?reasonField:null}")return;
    let condition='';for(let q=p.parentPath,i=0;i<4&&q;i++,q=q.parentPath){if(['LogicalExpression','ConditionalExpression','IfStatement'].includes(q.node.type)){const test=q.node.test||q.node.left||q.node;condition=source.slice(test.start,test.end);break;}}
    const statusCopy=/empty|noData|noRows|noResults|loading|notFound|없|항목이|자료가|rows\.length|displayRows\.length/i.test(body);
    const statusGuard=/length|loading|failed|error/.test(condition)&&!/<(?:Button|TextField|Select|Stack|Chip)/.test(body);
    if(statusCopy||statusGuard)add('inlineStatusRows',n,{start:n.start,end:n.end,body,condition,attributes:cell.openingElement.attributes.map(attr=>attr.name?.name).filter(Boolean)});
   },
  });
 }}visit(root);return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=auditUi();
 if(process.argv.includes('--json'))console.log(JSON.stringify(result,null,2));
 else{
  console.log(`UI inventory: ${result.files} JSX files, ${result.tables} tables, ${result.sharedStatusRows} shared status rows, ${result.inlineStatusRows.length} inline status rows in ${new Set(result.inlineStatusRows.map(row=>row.file)).size} files.`);
  console.log(`Pagination: ${result.sharedPagination} shared controls, ${result.inlinePagination.length} inline candidates.`);
  for(const row of result.inlineStatusRows)console.log(`${row.file}:${row.line} ${row.body.replace(/\s+/g,' ').slice(0,160)}`);
  console.log(`Other review candidates (not automatic defects): ${result.nativeSelects.length} native selects, ${result.muiAutocomplete.length} Autocomplete uses, ${result.nativeDialogs.length} native dialog calls, ${result.rawAlerts.length} direct MUI alerts, ${result.dialogsWithoutActions.length} dialogs without direct footer.`);
 }
 if(!process.argv.includes('--report')&&!process.argv.includes('--json')&&(result.inlineStatusRows.length||result.rawAlerts.length||result.inlinePagination.length||result.muiAutocomplete.length||result.nativeSelects.length||result.nativeDialogs.some(row=>!row.file.endsWith('/PageDialogProvider.jsx'))))process.exitCode=1;
}
