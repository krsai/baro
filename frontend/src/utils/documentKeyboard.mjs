import {advanceFormFocus} from './formFocus.mjs';
export const advanceDocumentInput=element=>advanceFormFocus(element);
export function documentInputKeyDown(event){
 if(event.defaultPrevented||event.key!=='Enter'||event.shiftKey||event.ctrlKey||event.altKey||event.metaKey||event.nativeEvent?.isComposing||event.keyCode===229)return;
 const target=event.target;if(target.tagName!=='INPUT'||target.getAttribute('aria-haspopup')||['checkbox','radio','file','submit','button'].includes(target.type))return;
 if(advanceDocumentInput(target))event.preventDefault();
}
