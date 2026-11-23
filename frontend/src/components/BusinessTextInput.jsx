import React,{forwardRef,useRef} from 'react';
import {FilledInput,Input,InputLabel,OutlinedInput} from '@mui/material';
import {textFieldCase,titleCasePartyBlock,titleCaseWords} from '../utils/humanTextCase.mjs';

// MUI TextField's input slot keeps the original input, textarea and variant contracts.
const BusinessTextInput=forwardRef(function BusinessTextInput({ownerState={},onChange,onBlur,onCompositionStart,onCompositionEnd,...props},ref){
 const composing=useRef(false),Component=ownerState.variant==='standard'?Input:ownerState.variant==='filled'?FilledInput:OutlinedInput;
 const normalize=event=>{
  const policy=textFieldCase({...ownerState,...props});
  if(composing.current||event.nativeEvent?.isComposing||!onChange||!['title','party'].includes(policy))return;
  const before=event.target.value,next=policy==='party'?titleCasePartyBlock(before):titleCaseWords(before);
  if(next!==before){event.target.value=next;onChange(event);}
 };
 return <Component {...props} ref={ref} onChange={onChange}
  onCompositionStart={event=>{composing.current=true;onCompositionStart?.(event);}}
  onCompositionEnd={event=>{composing.current=false;onCompositionEnd?.(event);}}
  onBlur={event=>{normalize(event);onBlur?.(event);}}/>;
});
export default BusinessTextInput;
export const BusinessInputLabel=forwardRef(function BusinessInputLabel({ownerState,children,...props},ref){
 return <InputLabel {...props} ref={ref}>{typeof children==='string'?titleCaseWords(children):children}</InputLabel>;
});
