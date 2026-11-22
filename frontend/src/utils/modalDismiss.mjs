const documents=new WeakMap();
export const isModalEscape=(event,ignoreDefaultPrevented=false)=>event.key==='Escape'&&(ignoreDefaultPrevented||!event.defaultPrevented)&&!event.repeat&&!event.isComposing&&!event.nativeEvent?.isComposing&&event.keyCode!==229&&event.which!==229&&!event.ctrlKey&&!event.altKey&&!event.metaKey;
const visible=node=>node?.isConnected&&node.getClientRects().length>0&&!node.closest('[hidden],[inert],[aria-hidden="true"]')&&node.ownerDocument.defaultView.getComputedStyle(node).visibility!=='hidden';

// Bubble phase is intentional: menus, pickers, IME and MUI's own top modal get
// first refusal. This handles Escape only when focus is outside the modal.
export function registerModalDismiss(entry,doc=document){
 let state=documents.get(doc);
 if(!state){
  state={entries:new Set(),listener:null};
  state.listener=event=>{
   if(!isModalEscape(event))return;
   if([...doc.querySelectorAll('[role="listbox"],[role="menu"],.MuiPickerPopper-root')].some(visible))return;
   const modals=[...doc.querySelectorAll('.MuiModal-root')].filter(visible);
   const top=modals.map((node,index)=>({node,index,z:Number.parseInt(doc.defaultView.getComputedStyle(node).zIndex,10)||0})).sort((a,b)=>a.z-b.z||a.index-b.index).at(-1)?.node;
   if(!top)return;
   const target=[...state.entries].reverse().find(item=>item.root()===top);
   if(!target||target.disabled())return;
   event.preventDefault();target.close(event,'escapeKeyDown');
  };
  documents.set(doc,state);doc.addEventListener('keydown',state.listener);
 }
 state.entries.add(entry);
 return()=>{state.entries.delete(entry);if(!state.entries.size){doc.removeEventListener('keydown',state.listener);documents.delete(doc);}};
}
