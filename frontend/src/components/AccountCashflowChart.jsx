import React from 'react';
import {Box,Typography} from '@mui/material';
import {cashflowSegments,cashflowColor} from '../utils/accountCashflow.mjs';
import {formatLedgerMoney} from '../utils/bankLedgerMoney.mjs';
import {activateOnKeyboard} from '../utils/keyboardPolicy.mjs';
const point=(radius,angle)=>[110+radius*Math.cos(angle),110+radius*Math.sin(angle)];
const arc=(start,end)=>{if(end-start>=Math.PI*2-.00001)return 'M110 22 A88 88 0 1 1 109.999 22 L109.999 58 A52 52 0 1 0 110 58 Z';const a=point(88,start),b=point(88,end),c=point(52,end),d=point(52,start),large=end-start>Math.PI?1:0;return `M${a} A88 88 0 ${large} 1 ${b} L${c} A52 52 0 ${large} 0 ${d} Z`;};
export default function AccountCashflowChart({items,direction,title,total,currencyCode,active,onActive,onSelect,getName,empty}){
 const segments=cashflowSegments(items,direction);
 return <Box data-cashflow-chart={direction} sx={{minWidth:0,textAlign:'center'}}><Typography variant="subtitle2">{title}</Typography><Typography fontWeight={700} sx={{fontVariantNumeric:'tabular-nums',overflowWrap:'anywhere'}}>{formatLedgerMoney(total,currencyCode)}</Typography><Box sx={{position:'relative',maxWidth:260,mx:'auto'}}>
  <svg viewBox="0 0 220 220" role="group" aria-label={title} style={{display:'block',width:'100%',height:'auto'}} onPointerLeave={()=>onActive(null)}>
   {!segments.length&&<circle cx="110" cy="110" r="70" fill="none" stroke="var(--color-border, #e7ecf2)" strokeWidth="36"/>}
   {segments.map(row=><path key={row.itemKey} data-cashflow-item={row.itemKey} d={arc(row.start,row.end)} fill={cashflowColor(row.itemKey)} opacity={active&&active!==row.itemKey?0.3:1} stroke="white" strokeWidth="2" tabIndex={0} role="button" aria-label={`${getName(row)} · ${formatLedgerMoney(row[direction],currencyCode)}`} onPointerEnter={()=>onActive(row.itemKey)} onFocus={()=>onActive(row.itemKey)} onBlur={()=>onActive(null)} onClick={()=>onSelect(row.itemKey)} onKeyDown={event=>activateOnKeyboard(event,()=>onSelect(row.itemKey))}><title>{getName(row)+' · '+formatLedgerMoney(row[direction],currencyCode)}</title></path>)}
  </svg>{!segments.length&&<Typography variant="caption" sx={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',p:6,pointerEvents:'none'}}>{empty}</Typography>}
 </Box></Box>;
}
