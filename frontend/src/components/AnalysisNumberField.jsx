import React,{useState} from 'react';
import {flushSync} from 'react-dom';
import DecimalAmountField from './DecimalAmountField';
// Round the display, not the saved calculation basis. CBM needs extra precision.
export default function AnalysisNumberField({value,onValueChange,precision=2,sx,...props}){
 const [focused,setFocused]=useState(false);
 const display=focused||value===''||value==null?value:Number(value).toLocaleString('en-US',{maximumFractionDigits:precision,useGrouping:false});
 return <DecimalAmountField {...props} value={display} onValueChange={onValueChange} onFocus={()=>flushSync(()=>setFocused(true))} onBlur={()=>setFocused(false)} sx={[{'& input':{textAlign:'right',fontVariantNumeric:'tabular-nums'}},...(Array.isArray(sx)?sx:[sx])]}/>;
}
