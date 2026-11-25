import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('../backend/node_modules/typescript');
// Execute the production callback, including its catch/finally paths, rather
// than comparing its source text to a spelling or recreating its behavior.
function callback(file,name,dependencies){
 const source=readFileSync('frontend/src/'+file,'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let target;
 const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(tree)===name&&ts.isCallExpression(node.initializer)&&node.initializer.expression.getText(tree).endsWith('useCallback'))target=node.initializer.arguments[0];ts.forEachChild(node,visit);};visit(tree);assert.ok(target,file+': '+name);
 return vm.runInNewContext('('+target.getText(tree)+')',dependencies);
}
const offline=async()=>{throw Error('offline');};
test('order background refresh preserves rows and reports failure instead of acknowledging it',async()=>{
 const writes=[],deps={activeOrgId:1,setOrdersLoaded(){},setQueryFailed(){},setOrders:rows=>writes.push(rows),fetchOrdersFromApi:offline,showNotification(){},orderPageText:{ordersLoadError:'offline'}};
 const run=callback('pages/App/order/OrderList.jsx','loadOrdersFromDb',deps);
 assert.equal(await run({forceRefresh:true}),false);assert.equal(writes.length,0);assert.equal(await run(),false);assert.equal(writes.length,1);
});
test('order reference refresh preserves the current styles on background failure',async()=>{
 const writes=[],run=callback('pages/App/order/OrderList.jsx','refreshStyles',{fetchStylesFromApi:offline,setStyles:rows=>writes.push(rows),showNotification(){},orderPageText:{stylesLoadError:'offline'}});
 assert.equal(await run(1,{forceRefresh:true}),false);assert.equal(writes.length,0);
});
test('style event refresh propagates loader failure when requested by the shared refresh queue',async()=>{
 const writes=[],run=callback('pages/App/style/StyleBoard.jsx','refreshStyles',{activeOrgId:1,isBrand:false,mountedRef:{current:true},currentOrgRef:{current:1},fetchStylesFromApi:offline,setStyles:rows=>writes.push(rows),setLoading(){},setLoadError(){},showNotification(){},getUiMessage:()=> 'offline',languageCode:'en'});
 await assert.rejects(run({forceRefresh:true,throwOnError:true}),/offline/);assert.equal(writes.length,0);
});
test('dashboard background failure preserves the previous summary and reports failure',async()=>{
 const writes=[],run=callback('pages/App/WorkspaceDashboard.jsx','loadSummaryData',{isSystemProfile:false,activeOrgId:1,authState:{},canAccessPath:()=>true,canViewEmployee:false,canViewCustomer:false,fetchOrders:offline,requestJSON:async()=>({assignments:[]}),buildQueryString:()=>'',setSummaryLoading(){},setQueryError(){},setSummaryData:rows=>writes.push(rows),createEmptySummary:()=>({empty:true}),showNotification(){},resolveText:()=> 'offline',DASHBOARD_TEXT:{summaryLoadError:'offline'},languageCode:'en'});
 assert.equal(await run({forceRefresh:true}),false);assert.equal(writes.length,0);
});
test('QC background failure preserves current row drafts and returns failure',async()=>{
 const writes=[],run=callback('pages/App/QcReview.jsx','loadRows',{selectedFactoryId:1,activeOrgId:1,toPositiveIntOrNull:Number,setRows:rows=>writes.push(rows),setLoading(){},setLoadError(){},requestJSON:offline,buildQueryString:()=>'',resolveQcReviewApiErrorMessage:()=> 'offline'});
 assert.equal(await run({forceRefresh:true}),false);assert.equal(writes.length,0);
});
test('customer production report does not acknowledge a failed refresh',async()=>{
 const writes=[],run=callback('pages/App/CustomerProductionReport.jsx','load',{activeOrgId:1,setLoading(){},setError(){},setData:rows=>writes.push(rows),requestJSON:offline,buildQueryString:()=>'',text:{loadError:'offline'}});
 assert.equal(await run(),false);assert.equal(writes.length,0);
});
test('material list failure keeps the prior catalogue and variants and remains pending',async()=>{
 const writes=[],run=callback('components/MaterialMasterList.jsx','load',{sequence:{current:0},orgId:1,setLoading(){},setError(){},setCatalogue:rows=>writes.push(rows),setVariants:rows=>writes.push(rows),requestJSON:offline,buildQueryString:()=>'',t:{failed:'offline'}});
 assert.equal(await run(),false);assert.equal(writes.length,0);
});
