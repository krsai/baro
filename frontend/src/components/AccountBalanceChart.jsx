import React,{useEffect,useRef,useState} from 'react';
import {Box,Typography} from '@mui/material';
import {formatLedgerMoney} from '../utils/bankLedgerMoney.mjs';
import {balanceChartScale} from '../utils/balanceChartScale.mjs';
export default function AccountBalanceChart({points,currencyCode,label}){
 const container=useRef(null),[width,setWidth]=useState(1000),[selected,setSelected]=useState(null);
 useEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(Math.max(280,entry.contentRect.width)));observer.observe(container.current);return()=>observer.disconnect();},[]);
 const height=300,top=20,bottom=38,right=16;
 const {low,high,ticks}=balanceChartScale(points.map(row=>Number(row.balance)));
 const left=Math.min(width*.34,Math.max(48,...ticks.map(value=>value.toLocaleString().length*7+14))),plotWidth=width-left-right,plotHeight=height-top-bottom;
 const x=index=>left+index*plotWidth/Math.max(1,points.length-1),y=value=>top+(high-value)/(high-low)*plotHeight;
 const index=Math.max(0,Math.min(selected??points.length-1,points.length-1)),point=points[index];
 const choose=event=>{
  const svg=event.currentTarget,matrix=svg.getScreenCTM();
  if(!matrix||!points.length)return;
  const cursor=svg.createSVGPoint();cursor.x=event.clientX;cursor.y=event.clientY;
  const at=cursor.matrixTransform(matrix.inverse()).x;
  setSelected(Math.max(0,Math.min(points.length-1,Math.round((at-left)/plotWidth*(points.length-1)))));
 };
 const tooltipX=point?x(index):0,tooltipY=point?y(Number(point.balance)):0;
 return <Box ref={container} sx={{minWidth:0,position:'relative',width:'100%'}} data-testid="account-balance-chart">
 <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} tabIndex={0} onPointerMove={choose} onPointerLeave={()=>setSelected(null)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();setSelected(Math.max(0,Math.min(points.length-1,index+(event.key==='ArrowLeft'?-1:1))));}}} style={{display:'block',width:'100%',height:300}}>
  {ticks.map(value=><g key={value}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} stroke="var(--color-border, #e1e8ef)"/><text data-axis-tick x={left-10} y={y(value)+4} textAnchor="end" fill="currentColor" fontSize="12">{value.toLocaleString()}</text></g>)}
  {points.filter((_,i)=>i%Math.max(1,Math.ceil((points.length-1)/(width<500?3:6)))===0||i===points.length-1).map(row=>{const i=points.indexOf(row);return <text key={row.date} x={x(i)} y={height-12} textAnchor={i===points.length-1?'end':'middle'} fill="currentColor" fontSize="12">{row.date.slice(5)}</text>;})}
  <polyline data-balance-line points={points.map((row,i)=>`${x(i)},${y(Number(row.balance))}`).join(' ')} fill="none" stroke="#2e74ff" strokeWidth="3" strokeLinejoin="round"/>
  {point&&<><line x1={x(index)} x2={x(index)} y1={top} y2={height-bottom} stroke="#98b8ee" strokeDasharray="4 4"/><circle cx={x(index)} cy={y(Number(point.balance))} r="5" fill="#2e74ff"/></>}
 </svg>
 {point&&<Box role="status" data-testid="balance-chart-tooltip" sx={{position:'absolute',pointerEvents:'none',left:Math.max(0,Math.min(width-180,tooltipX+12)),top:tooltipY>90?tooltipY-68:tooltipY+12,maxWidth:180,px:1.25,py:.75,bgcolor:'background.paper',border:1,borderColor:'divider',borderRadius:1,boxShadow:2}}><Typography variant="caption" color="text.secondary" display="block">{point.date}</Typography><Typography variant="body2" fontWeight={600} sx={{fontVariantNumeric:'tabular-nums',overflowWrap:'anywhere'}}>{formatLedgerMoney(point.balance,currencyCode)}</Typography></Box>}
 </Box>;
}
