import React,{useEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {TextField} from '@mui/material';
import {parseVolumeInput} from '../utils/volumeFormula.mjs';
import {reviewVolumeFormula} from '../utils/volumeFormulaReview.mjs';
import {useAppActions} from '../context/AppContext';
import {shippingEditorText} from '../constants/shippingEditor';

export default function VolumeInput({value='',formula='',quantity='',onChange,label,disabled,languageCode}){
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState(formula||value);
 const {showNotification}=useAppActions(),t=shippingEditorText[languageCode]||shippingEditorText.en;
 const lastReview=useRef('');
 useEffect(()=>{if(!editing)setDraft(formula||value);},[formula,value,editing]);
 useEffect(()=>{
  if(editing||disabled)return;
  const review=reviewVolumeFormula(formula,quantity);
  if(!review){lastReview.current='';return;}
  const signature=JSON.stringify([formula,quantity]);if(lastReview.current===signature)return;
  lastReview.current=signature;
  showNotification(t.volumeCountWarning.replace('{quantity}',String(review.quantity)).replace('{terms}',String(review.terms)),'warning');
 },[editing,disabled,formula,quantity,t.volumeCountWarning,showNotification]);
 const invalid=parseVolumeInput(editing?draft:formula||value)===null;
 return <TextField fullWidth size="small" name="cbm" label={label} disabled={disabled} value={editing?draft:invalid?formula||draft:value} error={invalid}
  data-text-case="preserve" slotProps={{htmlInput:{'aria-label':label,title:formula||'',maxLength:200,'data-text-case':'preserve',spellCheck:false}}}
  onFocus={event=>{flushSync(()=>{setDraft(formula||value);setEditing(true);});event.target.select();}}
  onChange={event=>{const raw=event.target.value;setDraft(raw);const parsed=parseVolumeInput(raw);onChange(parsed||{cbm:'',cbmFormula:raw});}}
  onBlur={()=>{setEditing(false);if(parseVolumeInput(draft)===null)showNotification(t.volumeInvalid,'error');}}/>;
}
