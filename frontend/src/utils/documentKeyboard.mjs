import {advanceFormFocus,textInputKeyDown} from './formFocus.mjs';
export const advanceDocumentInput=element=>advanceFormFocus(element);
export function documentInputKeyDown(event){
 textInputKeyDown(event);
}
