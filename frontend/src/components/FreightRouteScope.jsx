import React from 'react';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import {Box,Button,ButtonBase,Slider,Stack,Typography} from '@mui/material';
import WarehouseOutlined from '@mui/icons-material/WarehouseOutlined';
import FlightTakeoffOutlined from '@mui/icons-material/FlightTakeoffOutlined';
import FlightLandOutlined from '@mui/icons-material/FlightLandOutlined';
import AnchorOutlined from '@mui/icons-material/AnchorOutlined';
import {routeNodes,routeScopeText} from '../constants/freightRouteScope';

export default function FreightRouteScope({mode,service,value,onChange,languageCode,disabled=false,readOnly=false,locations={},completed={},onNodeClick}){
 const t=routeScopeText[languageCode]||routeScopeText.en,nodes=routeNodes(mode,service),last=nodes.length-1;
 const range=[nodes.indexOf(value?.start),nodes.indexOf(value?.end)];
 const valid=range[0]>=0&&range[1]>range[0];
 const label=node=>mode==='AIR'&&node==='ORIGIN_TERMINAL'?t.originAirport:mode==='AIR'&&node==='DESTINATION_TERMINAL'?t.destinationAirport:t[node];
 const select=([start,end])=>onChange({start:nodes[start],end:nodes[end]});
 const presets=mode==='ROAD'?[['all',[0,last]]]:[['all',[0,3]],['doorPort',[0,2]],['portDoor',[1,3]],['main',[1,2]]];
 return <Stack spacing={2} data-testid="freight-route-scope">
  {!readOnly&&service!=='EXPRESS'&&<Stack direction="row" useFlexGap flexWrap="wrap" justifyContent="center" gap={1}>{presets.map(([key,r])=><Button key={key} size="small" variant={valid&&range.every((v,i)=>v===r[i])?'contained':'outlined'} disabled={disabled} onClick={()=>select(r)}>{t[key]}</Button>)}</Stack>}
  <Box sx={{px:{xs:0,sm:2}}}><Box sx={{display:'grid',gridTemplateColumns:{xs:nodes.length===2?'repeat(2,minmax(0,1fr))':'repeat(2,minmax(0,1fr))',sm:`repeat(${nodes.length},minmax(0,1fr))`},gap:1.5}}>{nodes.map((node,i)=>{const included=valid&&i>=range[0]&&i<=range[1];return <Box component={onNodeClick?ButtonBase:'div'} key={node} data-route-node={node} data-complete={!!completed[node]} aria-label={onNodeClick?label(node):undefined} disabled={onNodeClick?(disabled||!included):undefined} onClick={onNodeClick?()=>onNodeClick(node):undefined} sx={{position:'relative',display:'flex',flexDirection:'column',alignItems:'center',gap:.5,p:{xs:1,sm:1.5},textAlign:'center',border:1,borderColor:included?'primary.main':'divider',bgcolor:included?'action.selected':'background.default',borderRadius:1.5,minWidth:0,opacity:included?1:.45,'&.Mui-focusVisible':{outline:'2px solid',outlineColor:'primary.main',outlineOffset:2}}}><Box sx={{color:included?'primary.main':'text.secondary'}}>{node.endsWith('DOOR')?<WarehouseOutlined/>:mode==='AIR'?(node==='DESTINATION_TERMINAL'?<FlightLandOutlined/>:<FlightTakeoffOutlined/>):<AnchorOutlined/>}</Box><Typography variant="caption" fontWeight={600} sx={{overflowWrap:'anywhere'}}>{label(node)}</Typography>{included&&<><Stack direction="row" gap={.5} alignItems="center">{completed[node]&&<CheckCircleOutline fontSize="small" color="success"/>}<Typography variant="caption" color={completed[node]?'success.main':'text.secondary'}>{completed[node]?t.entered:t.notEntered}</Typography></Stack><Typography variant="caption" sx={{overflowWrap:'anywhere',whiteSpace:'normal'}}>{locations[node]||(!readOnly?t.clickLocation:'—')}</Typography></>}</Box>;})}</Box>
   <Box data-route-track sx={{position:'relative',mt:1,mx:nodes.length===2?'25%':'12.5%',width:nodes.length===2?'50%':'75%'}}>{service==='EXPRESS'?<Box sx={{height:4,my:1.5,bgcolor:'primary.main',borderRadius:2}}/>:<Slider disabled={disabled} min={0} max={last} step={1} marks disableSwap value={valid?range:[0,last]} getAriaLabel={index=>index?t.end:t.start} getAriaValueText={index=>label(nodes[index])} onChange={(_event,next)=>{if(next[0]<next[1])select(next);}} sx={{display:'block',color:'primary.main'}}/>}{nodes.slice(0,last).map((node,i)=><Box key={node} component="svg" data-route-direction aria-hidden="true" viewBox="0 0 16 16" sx={{position:'absolute',left:`${(i+.5)/last*100}%`,top:'50%',transform:'translate(-50%,-50%)',width:24,height:24,color:'primary.main',opacity:disabled?.38:valid&&i>=range[0]&&i<range[1]?1:.38,pointerEvents:'none'}}><path d="M4 2 L13 8 L4 14 Z" fill="currentColor"/></Box>)}</Box>
  </Box>
  {!valid&&<Typography variant="body2" color="text.secondary">{t.selectScope}</Typography>}
 </Stack>;
}
