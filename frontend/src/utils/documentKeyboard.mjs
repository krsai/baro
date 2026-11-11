export function advanceDocumentInput(element){
 const scope=element?.closest('[role="dialog"]')||element?.closest('[data-document-keyboard]');if(!scope)return false;
 const nodes=[...scope.querySelectorAll('input,textarea,select,button,[role="combobox"],[tabindex]')].filter(node=>!node.disabled&&!node.readOnly&&node.tabIndex>=0&&node.getClientRects().length&&!node.closest('[aria-hidden="true"]'));
 const index=nodes.indexOf(element),next=index<0?null:nodes[index+1];if(!next)return false;next.focus();return true;
}
export function documentInputKeyDown(event){
 if(event.defaultPrevented||event.key!=='Enter'||event.shiftKey||event.ctrlKey||event.altKey||event.metaKey||event.nativeEvent?.isComposing||event.keyCode===229)return;
 const target=event.target;if(target.tagName!=='INPUT'||target.getAttribute('aria-haspopup')||['checkbox','radio','file','submit','button'].includes(target.type))return;
 if(advanceDocumentInput(target))event.preventDefault();
}
