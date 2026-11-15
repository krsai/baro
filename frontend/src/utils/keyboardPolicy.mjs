// APG keyboard conventions plus BARO's explicit lookup/next-field shortcuts.
// Native buttons, checkboxes, text editing, menus and date pickers keep their
// own semantics; callers must not turn every key into a selection command.
export function keyboardAction(event,context){
 if(event.defaultPrevented||event.isComposing||event.nativeEvent?.isComposing||event.keyCode===229||event.nativeEvent?.keyCode===229||event.ctrlKey||event.altKey||event.metaKey)return null;
 if(event.key==='Tab')return event.shiftKey?'previous-field':'next-field';
 if(event.shiftKey)return null;
 if(event.key==='Escape')return 'dismiss';
 if(context==='lookup')return event.key==='F2'?'search':event.key==='Enter'?'confirm':null;
 if(context==='segment'||context==='lookup-results'){
  if(['ArrowRight','ArrowLeft'].includes(event.key)&&context==='lookup-results')return null;
  if(['ArrowDown','ArrowRight'].includes(event.key))return 'next-option';
  if(['ArrowUp','ArrowLeft'].includes(event.key))return 'previous-option';
  if(context==='segment'&&event.key==='Home')return 'first-option';
  if(context==='segment'&&event.key==='End')return 'last-option';
  if(event.key==='Enter'||context==='segment'&&event.key===' ')return 'confirm';
 }
 return null;
}

// For non-native clickable rows/cards only. Native buttons keep their browser
// Enter/Space behavior, and child actions must never activate the parent row.
export function activateOnKeyboard(event,activate){
 if(event.target!==event.currentTarget||keyboardAction(event,'segment')!=='confirm'||event.currentTarget.matches(':disabled,[aria-disabled="true"]'))return;
 event.preventDefault();event.stopPropagation();
 if(activate)activate();else event.currentTarget.click();
}
