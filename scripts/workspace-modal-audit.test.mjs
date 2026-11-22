import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
const files=[];
function walk(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){const path=`${directory}/${entry.name}`;if(entry.isDirectory())walk(path);else if(/\.jsx?$/.test(path))files.push(path);}}
walk('frontend/src/pages/App');walk('frontend/src/components');

test('all business dialogs and drawers use the shared workspace scope without native dialog calls or custom roots',()=>{
  let dialogs=0,drawers=0;
  for(const file of files){
    if(/\/(PageDialogProvider|WorkspaceDialogScope)\.jsx$/.test(file))continue;
    const source=readFileSync(file,'utf8');
    assert.doesNotMatch(source,/window\.(confirm|prompt|alert)\(/,file);
    // Header actions, inline panels, drag previews and a shared picker owner
    // may portal, while modal shells must retain the shared root.
    const nonModalPortals={'CompanyConnections.jsx':2,'PartnerClassificationFields.jsx':1,'VersionAssignmentBoard.jsx':1,'OrganizationDetail.jsx':1,'MaterialMasterList.jsx':1,'PartnerHandledItemsFields.jsx':1,'MaterialSelectionDialog.jsx':1};
    const basename=file.split('/').pop(),portals=(source.match(/createPortal\(/g)||[]).length;
    assert.equal(portals,nonModalPortals[basename]||0,file);
    if(basename==='MaterialMasterList.jsx')assert.match(source,/createPortal\(registrationAction,actionContainer\)/);
    if(basename==='MaterialSelectionDialog.jsx')assert.match(source,/createPortal\(<MaterialItemPicker/);
    if(basename==='PartnerHandledItemsFields.jsx')assert.match(source,/createPortal\(<Box component="aside"/);
    assert.doesNotMatch(source,/<Modal\b|<dialog\b/,file);
    if(basename==='CompanyConnections.jsx')assert.match(source,/createPortal\(<CompanyPublicSearchPanel[\s\S]*sidePanelTarget/);
    if(basename==='PartnerClassificationFields.jsx')assert.match(source,/createPortal\(<Box component="aside"/);
    if(basename==='VersionAssignmentBoard.jsx')assert.match(source,/createPortal\(<DragOverlay[\s\S]*pointerEvents: 'none'/);
    assert.doesNotMatch(source,/slots=\{\{\s*root:/,file);
    dialogs+=(source.match(/<Dialog\b/g)||[]).length;drawers+=(source.match(/<Drawer\b/g)||[]).length;
  }
  assert.ok(dialogs>30);assert.equal(drawers,7);
  console.log(`Audited ${dialogs} business Dialog instances and ${drawers} Drawer instances.`);
});

test('workspace scope applies the same modal root to dialogs and temporary drawers',()=>{
  const source=readFileSync('frontend/src/components/WorkspaceDialogScope.jsx','utf8');
  assert.match(source,/MuiDialog:[\s\S]*root: WorkspaceDialogRoot/);
  assert.match(source,/MuiDrawer:[\s\S]*root: WorkspaceDialogRoot/);
  assert.match(source,/<PageDialogProvider>/);
  assert.match(source,/open=\{Boolean\(open && scope.active\)\}/);
  assert.match(source,/keepMounted=\{keepMounted \|\| Boolean\(open && !scope.active\)\}/);
});
