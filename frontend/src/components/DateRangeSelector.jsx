import React from 'react';
import MonthRangeSelector from './MonthRangeSelector';
// The single day-level query control. Callbacks receive dayjs dates like CustomDatePicker.
export default function DateRangeSelector({onShift,startValue,endValue,onStartChange,onEndChange,slotProps,...props}) {
 const shift=(_amount,range)=>{
  if(!startValue||!endValue)return;
  onStartChange?.(range.startValue);
  onEndChange?.(range.endValue);
 };
 return <MonthRangeSelector {...props} monthOnly={false} startValue={startValue} endValue={endValue} onStartChange={onStartChange} onEndChange={onEndChange} onShift={onShift||shift} slotProps={{...slotProps,textField:{...slotProps?.textField,sx:{width:140,minWidth:140,...slotProps?.textField?.sx}}}}/>;
}
