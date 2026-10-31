import React,{useState} from 'react';
import {Box,Stack,Typography} from '@mui/material';
import {formatLedgerMoney} from '../utils/bankLedgerMoney.mjs';
export default function AccountBalanceChart({points,currencyCode,label}){
 const [selected,setSelected]=useState(null),width=1000,height=300,left=125,right=20,top=20,bottom=45;
 const values=points.map(row=>Number(row.balance)),minimum=Math.min(0,...values),maximum=Math.max(0,...values),span=maximum-minimum||1,low=minimum<0?minimum-span*.05:0,high=maximum+span*.05,plotWidth=width-left-right,plotHeight=height-top-bottom;
 const x=index=>left+index*plotWidth/Math.max(1,points.length-1),y=value=>top+(high-value)/(high-low)*plotHeight;
 const index=Math.min(selected??points.length-1,points.length-1),point=points[index];
 const choose=event=>{const rect=event.currentTarget.getBoundingClientRect(),at=(event.clientX-rect.left)/rect.width*width;setSelected(Math.max(0,Math.min(points.length-1,Math.round((at-left)/plotWidth*(points.length-1)))));};
 return <Box sx={{minWidth:0}} data-testid="account-balance-chart"><Stack direction="row" justifyContent="space-between" spacing={2} sx={{mb:1}}><Typography variant="caption" color="text.secondary">{point?.date}</Typography><Typography variant="body2" align="right" fontWeight={600}>{point?formatLedgerMoney(point.balance,currencyCode):'—'}</Typography></Stack>
 <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} tabIndex={0} onPointerMove={choose} onKeyDown={event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();setSelected(Math.max(0,Math.min(points.length-1,index+(event.key==='ArrowLeft'?-1:1))));}}} style={{display:'block',width:'100%',height:'auto',minHeight:180,maxHeight:320}}>
  {Array.from({length:5},(_,i)=>{const value=low+(high-low)*i/4;return <g key={i}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} stroke="var(--color-border, #e1e8ef)"/><text x={left-10} y={y(value)+4} textAnchor="end" fill="currentColor" fontSize="12">{Math.round(value).toLocaleString()}</text></g>;})}
  {points.filter((_,i)=>i%5===0||i===points.length-1).map(row=>{const i=points.indexOf(row);return <text key={row.date} x={x(i)} y={height-15} textAnchor="middle" fill="currentColor" fontSize="12">{row.date.slice(5)}</text>;})}
  <polyline points={points.map((row,i)=>`${x(i)},${y(Number(row.balance))}`).join(' ')} fill="none" stroke="#2e74ff" strokeWidth="3" strokeLinejoin="round"/>
  {point&&<><line x1={x(index)} x2={x(index)} y1={top} y2={height-bottom} stroke="#98b8ee" strokeDasharray="4 4"/><circle cx={x(index)} cy={y(Number(point.balance))} r="5" fill="#2e74ff"/></>}
 </svg></Box>;
}
