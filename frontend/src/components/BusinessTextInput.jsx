import React,{forwardRef,useRef,useState} from 'react';
import {FilledInput,Input,InputLabel,OutlinedInput} from '@mui/material';
import {textFieldCase,titleCasePartyBlock,titleCaseWords} from '../utils/humanTextCase.mjs';

// MUI TextField's input slot keeps the original input, textarea and variant contracts.
const BusinessTextInput=forwardRef(function BusinessTextInput({ownerState={},onChange,onFocus,onBlur,onCompositionStart,onCompositionEnd,...props},ref){
 const composing=useRef(false),Component=ownerState.variant==='standard'?Input:ownerState.variant==='filled'?FilledInput:OutlinedInput;
 const [editing,setEditing]=useState(false),changed=useRef(false);
 const policy=textFieldCase({...ownerState,...props});
 const format=value=>policy==='party'?titleCasePartyBlock(value):titleCaseWords(value);
 // Presentation never changes the parent's draft. Only an actual edit may emit
 // a normalized value; focusing a legacy value must not mark a form dirty.
 const display=policy==='title'&&typeof props.value==='string'&&!editing&&!composing.current?format(props.value):props.value;
 const normalize=event=>{
  if(!changed.current||composing.current||event.nativeEvent?.isComposing||!onChange||!['title','party'].includes(policy))return;
  const before=event.target.value,next=format(before);
  if(next!==before){event.target.value=next;onChange(event);}
 };
 return <Component {...props} {...(props.value!==undefined?{value:display}:{})} ref={ref}
  onFocus={event=>{changed.current=false;setEditing(false);onFocus?.(event);}}
  onChange={event=>{changed.current=true;setEditing(true);onChange?.(event);}}
  onCompositionStart={event=>{composing.current=true;onCompositionStart?.(event);}}
  onCompositionEnd={event=>{composing.current=false;onCompositionEnd?.(event);}}
  onBlur={event=>{normalize(event);changed.current=false;setEditing(false);onBlur?.(event);}}/>;
});
export default BusinessTextInput;
export const BusinessInputLabel=forwardRef(function BusinessInputLabel({ownerState,children,...props},ref){
 return <InputLabel {...props} ref={ref}>{typeof children==='string'?titleCaseWords(children):children}</InputLabel>;
});
