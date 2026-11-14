const dialogSelector='[role="dialog"],.MuiModal-root .MuiDrawer-paper';
const pageSelector='main.app-page,[data-workspace-page],main,form';
const controlSelector='input,textarea,select,button,a[href],[contenteditable="true"],[tabindex]';
const origins=new WeakMap(),pending=new WeakMap();
let installed=null;

export function canFocus(node){
 return !!node?.isConnected&&node.tabIndex>=0&&!node.matches(':disabled,[aria-disabled="true"]')&&!node.readOnly&&node.getAttribute('aria-readonly')!=='true'&&
  !node.closest('[hidden],[inert],[aria-hidden="true"],[aria-disabled="true"],[aria-readonly="true"],[data-keyboard-navigation="off"]')&&!!node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden';
}
export function navigationScope(node){return node?.closest(dialogSelector)||node?.closest('[data-document-keyboard],'+pageSelector)||node?.ownerDocument?.body;}
export function navigationStops(scope){
 if(!scope)return [];
 const nodes=[...scope.querySelectorAll(controlSelector)].filter(node=>canFocus(node)&&!node.closest('[role="listbox"],[role="menu"]')&&
  (!node.closest(dialogSelector)||node.closest(dialogSelector)===(scope.matches(dialogSelector)?scope:scope.closest(dialogSelector))));
 return nodes.filter(node=>{
  if(node.type!=='radio'||!node.name)return true;
  const group=nodes.filter(other=>other.type==='radio'&&other.name===node.name&&other.form===node.form);
  return node===(group.find(other=>other.checked)||group[0]);
 }).sort((a,b)=>((a.tabIndex>0?a.tabIndex:Infinity)-(b.tabIndex>0?b.tabIndex:Infinity))||0);
}
function focus(node){if(!canFocus(node))return false;node.focus({preventScroll:true});node.scrollIntoView?.({block:'nearest',inline:'nearest'});return node.ownerDocument.activeElement===node;}
export function advanceFormFocus(node,{backward=false,afterGroup=false,afterContainer}={}){
 const scope=navigationScope(node),stops=navigationStops(scope),group=afterContainer||(afterGroup?node.closest('[role="radiogroup"],[data-focus-next="group"]'):null);
 const index=stops.indexOf(node);if(index<0)return false;
 const following=backward?stops.slice(0,index).reverse():stops.slice(index+1);
 return focus(following.find(next=>!group?.contains(next)));
}
export function dialogOpener(dialog){return origins.get(dialog)||null;}
// Wait for MUI's popup focus restoration and the parent's inert state to settle.
// A later key/click cancels this move; an asynchronous rerender never wins over the user.
export function advanceAfterSelection(origin,{popup,afterGroup=false,afterContainer}={}){
 if(!origin)return;
 const token={},manager=installed,version=installed?.interaction;
 pending.set(origin,token);let frames=0;
 const run=()=>{
  if(pending.get(origin)!==token||!origin.isConnected||manager&&installed!==manager||installed&&installed.interaction!==version)return;
  const active=origin.ownerDocument.activeElement;
  if(popup?.isConnected&&popup.getClientRects().length&&!popup.closest('[aria-hidden="true"]')||!canFocus(origin)){
   if(++frames<60)requestAnimationFrame(run);return;
  }
  if(active!==origin&&active!==origin.ownerDocument.body&&!popup?.contains(active)&&!active?.matches('.MuiDialog-paper,.MuiPopover-paper'))return;
  pending.delete(origin);advanceFormFocus(origin,{afterGroup,afterContainer});
 };
 requestAnimationFrame(()=>requestAnimationFrame(run));
}
export function advanceFromDialog(dialog){advanceAfterSelection(dialogOpener(dialog),{popup:dialog});}

export function installKeyboardNavigation(doc=document){
 if(installed){installed.references++;return release;}
 const state={references:1,interaction:0,frame:null,observer:null,lastFocused:doc.activeElement,boundaries:new Map(),popupOwners:new WeakMap()};installed=state;
 const layoutVisible=node=>node.isConnected&&getComputedStyle(node).visibility!=='hidden'&&
  (!!node.getClientRects().length||getComputedStyle(node).display==='contents'&&[...node.children].some(layoutVisible));
 const visible=node=>!node.closest('[hidden],[inert],[aria-hidden="true"]')&&layoutVisible(node);
 const initialTarget=scope=>{
  const stops=navigationStops(scope),explicit=stops.find(node=>node.matches('[data-initial-focus],[autofocus]'));
  return explicit||stops.find(node=>node.matches('input,textarea,select,[role="combobox"],[contenteditable="true"]'))||stops[0];
 };
 const scan=()=>{
  state.frame=null;
  for(const [scope]of state.boundaries)if(!scope.isConnected)state.boundaries.delete(scope);
  const dialogs=[...doc.querySelectorAll(dialogSelector)].filter(visible),top=dialogs.at(-1);
  const primary=[...doc.querySelectorAll('main.app-page')].filter(visible);
  const workspaces=[...doc.querySelectorAll('[data-workspace-page]')].filter(node=>visible(node)&&!primary.some(page=>node.contains(page)));
  const roots=[...primary,...workspaces];
  const fallback=[...doc.querySelectorAll('main,form')].filter(node=>visible(node)&&!roots.some(root=>root.contains(node)||node.contains(root))&&!node.parentElement?.closest('main,form'));
  const pages=top?[]:[...roots,...fallback].filter(node=>!node.closest(dialogSelector));
  // A modal temporarily makes its parent inert; that is not a new page opening.
  for(const [boundary,entry]of state.boundaries)if(!layoutVisible(boundary))entry.wasVisible=false;
  for(const scope of top?[top]:pages){
   let entry=state.boundaries.get(scope);
   if(!entry){entry={interaction:state.interaction,done:false};state.boundaries.set(scope,entry);if(scope.matches(dialogSelector)&&!origins.has(scope)&&!scope.contains(state.lastFocused))origins.set(scope,state.lastFocused);}
   if(entry.wasVisible===false){entry.done=false;entry.interaction=state.interaction;}
   entry.wasVisible=true;
   if(entry.done){
    if(doc.activeElement===doc.body&&entry.lastFocused&&!entry.lastFocused.isConnected&&state.interactionScope&&scope.contains(state.interactionScope))focus(initialTarget(scope));
    if(entry.fallback&&doc.activeElement===entry.fallback){const target=initialTarget(scope);if(target!==entry.fallback&&target?.matches('input,textarea,select,[role="combobox"]')){focus(target);entry.fallback=null;}}
    continue;
   }
   const active=doc.activeElement,target=initialTarget(scope);
   if(!target)continue;
   if(canFocus(active)&&scope.contains(active)&&active.matches('input,textarea,select,[role="combobox"],[contenteditable="true"],[data-initial-focus]')){entry.done=true;continue;}
   if(entry.interaction!==state.interaction){entry.done=true;continue;}
   if(focus(target)){entry.done=true;if(!target.matches('input,textarea,select,[role="combobox"],[contenteditable="true"]'))entry.fallback=target;}
  }
 };
 const schedule=()=>{if(state.frame==null)state.frame=requestAnimationFrame(scan);};
 const interacted=event=>{state.interaction++;state.interactionScope=navigationScope(event.target);};
 const focused=event=>{
  const dialog=event.target.closest?.(dialogSelector);
  if(dialog&&!origins.has(dialog)){const previous=event.relatedTarget||state.lastFocused;if(previous&&!dialog.contains(previous))origins.set(dialog,previous);}
  const list=event.target.closest?.('[role="listbox"]');
  if(list&&!state.popupOwners.has(list)){
   const controls=[...doc.querySelectorAll('[role="combobox"][aria-controls]')];
   const owner=controls.find(node=>node.getAttribute('aria-controls')===list.id);
   if(owner)state.popupOwners.set(list,owner);
  }
  state.lastFocused=event.target;
  for(const [scope,entry]of state.boundaries)if(scope.contains(event.target))entry.lastFocused=event.target;
 };
 const optionChosen=event=>{
  const option=event.target.closest?.('[role="option"]')||(event.target.getAttribute?.('aria-activedescendant')?doc.getElementById(event.target.getAttribute('aria-activedescendant')):null),list=option?.closest('[role="listbox"]');
  if(!list||option.getAttribute('aria-disabled')==='true'||list.getAttribute('aria-multiselectable')==='true')return;
  const owner=state.popupOwners.get(list)||[...doc.querySelectorAll('[role="combobox"][aria-controls]')].find(node=>node.getAttribute('aria-controls')===list.id);
  if(owner)advanceAfterSelection(owner,{popup:list.closest('.MuiPopover-root')||list});
 };
 const clicked=event=>{
  optionChosen(event);
  const choice=event.target.closest?.('input[type="radio"],[data-focus-next="group"] button');
  if(choice)advanceAfterSelection(choice,{afterGroup:true});
 };
 const changed=event=>{if(event.target.tagName==='SELECT'&&!event.target.multiple)advanceAfterSelection(event.target);};
 const keyCapture=event=>{interacted(event);if(!event.isComposing&&event.keyCode!==229&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&(event.key==='Enter'||event.key===' '&&event.target.closest?.('[role="option"],input[type="radio"],[data-focus-next="group"] button')))clicked(event);};
 const keyDown=event=>{
  if(event.defaultPrevented||event.isComposing||event.keyCode===229||event.ctrlKey||event.altKey||event.metaKey)return;
  const target=event.target;if(!target.closest?.(pageSelector+','+dialogSelector))return;
  if(event.key==='Tab'){
   if(target.closest('[role="listbox"],[role="menu"]'))return;
   const scope=navigationScope(target),stops=navigationStops(scope),index=stops.indexOf(target);
   if(index>=0){let next=stops[index+(event.shiftKey?-1:1)];if(!next&&scope.matches(dialogSelector))next=event.shiftKey?stops.at(-1):stops[0];if(next&&focus(next))event.preventDefault();}
   return;
  }
  if(event.key!=='Enter'||event.shiftKey||target.tagName!=='INPUT'||target.getAttribute('aria-haspopup')||target.closest('.MuiPickersInputBase-root')||['checkbox','radio','file','submit','button','date','time','datetime-local'].includes(target.type))return;
  if(advanceFormFocus(target))event.preventDefault();
 };
 state.observer=new MutationObserver(schedule);state.observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','readonly','aria-disabled','aria-hidden','hidden','inert','style','class']});
 doc.addEventListener('focusin',focused,true);doc.addEventListener('pointerdown',interacted,true);doc.addEventListener('input',interacted,true);doc.addEventListener('compositionstart',interacted,true);doc.addEventListener('keydown',keyCapture,true);doc.addEventListener('keydown',keyDown);doc.addEventListener('click',clicked,true);doc.addEventListener('change',changed,true);schedule();
 state.cleanup=()=>{state.observer.disconnect();cancelAnimationFrame(state.frame);doc.removeEventListener('focusin',focused,true);doc.removeEventListener('pointerdown',interacted,true);doc.removeEventListener('input',interacted,true);doc.removeEventListener('compositionstart',interacted,true);doc.removeEventListener('keydown',keyCapture,true);doc.removeEventListener('keydown',keyDown);doc.removeEventListener('click',clicked,true);doc.removeEventListener('change',changed,true);};
 return release;
}
function release(){if(installed&&!--installed.references){installed.cleanup();installed=null;}}
