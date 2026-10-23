import React from 'react';
import dayjs from 'dayjs';
import MonthRangeSelector from './MonthRangeSelector';
// The single day-level query control. Callbacks receive dayjs dates like CustomDatePicker.
export default function DateRangeSelector({onShift,startValue,endValue,onStartChange,onEndChange,slotProps,...props}) {
 const shift=amount=>{
  if(!startValue||!endValue)return;
  onStartChange?.(dayjs(startValue).add(amount,'month'));
  onEndChange?.(dayjs(endValue).add(amount,'month'));
 };
 return <MonthRangeSelector {...props} monthOnly={false} startValue={startValue} endValue={endValue} onStartChange={onStartChange} onEndChange={onEndChange} onShift={onShift||shift} slotProps={{...slotProps,textField:{...slotProps?.textField,sx:{width:140,minWidth:140,...slotProps?.textField?.sx}}}}/>;
}
