import React from 'react';
import {Box,Button,Slider,Stack,Typography} from '@mui/material';
import WarehouseOutlined from '@mui/icons-material/WarehouseOutlined';
import DirectionsBoatOutlined from '@mui/icons-material/DirectionsBoatOutlined';
import FlightTakeoffOutlined from '@mui/icons-material/FlightTakeoffOutlined';
import ArrowForward from '@mui/icons-material/ArrowForward';
import {routeNodes,routeScopeText} from '../constants/freightRouteScope';

export default function FreightRouteScope({mode,value,onChange,languageCode,disabled=false,readOnly=false}){
 const t=routeScopeText[languageCode]||routeScopeText.en,nodes=routeNodes(mode),last=nodes.length-1;
 const range=[nodes.indexOf(value?.start),nodes.indexOf(value?.end)];
 const valid=range[0]>=0&&range[1]>range[0];
 const label=node=>mode==='AIR'&&node==='ORIGIN_TERMINAL'?t.originAirport:mode==='AIR'&&node==='DESTINATION_TERMINAL'?t.destinationAirport:t[node];
 const select=([start,end])=>onChange({start:nodes[start],end:nodes[end]});
 const presets=mode==='ROAD'?[['all',[0,last]]]:[['all',[0,3]],['doorPort',[0,2]],['portDoor',[1,3]],['main',[1,2]]];
 return <Stack spacing={2} data-testid="freight-route-scope">
  {!readOnly&&<Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>{presets.map(([key,r])=><Button key={key} size="small" variant={valid&&range.every((v,i)=>v===r[i])?'contained':'outlined'} disabled={disabled} onClick={()=>select(r)}>{t[key]}</Button>)}</Stack>}
  <Box sx={{px:{xs:0,sm:2}}}><Box sx={{display:'grid',gridTemplateColumns:`repeat(${nodes.length}, minmax(0,1fr))`,gap:1}}>{nodes.map((node,i)=><Box key={node} sx={{p:{xs:1,sm:1.5},textAlign:'center',border:1,borderColor:valid&&i>=range[0]&&i<=range[1]?'primary.main':'divider',bgcolor:valid&&i>=range[0]&&i<=range[1]?'#EAF2FF':'background.default',borderRadius:1.5,minWidth:0}}><Box sx={{color:valid&&i>=range[0]&&i<=range[1]?'primary.main':'text.secondary',mb:.5}}>{node.endsWith('DOOR')?<WarehouseOutlined/>:mode==='AIR'?<FlightTakeoffOutlined/>:<DirectionsBoatOutlined/>}</Box><Typography variant="caption" fontWeight={600} sx={{overflowWrap:'anywhere'}}>{label(node)}</Typography></Box>)}</Box>
   <Box sx={{position:'relative',mt:1,mx:nodes.length===2?'25%':'12.5%',width:nodes.length===2?'50%':'75%'}}><Slider disabled={disabled} min={0} max={last} step={1} marks disableSwap value={valid?range:[0,last]} getAriaLabel={index=>index?t.end:t.start} getAriaValueText={index=>label(nodes[index])} onChange={(_event,next)=>{if(next[0]<next[1])select(next);}} sx={{display:'block',color:'primary.main'}}/><ArrowForward data-route-direction aria-hidden="true" sx={{position:'absolute',left:valid?`${(range[0]+range[1])*50/last}%`:'50%',top:'50%',transform:'translate(-50%,-50%)',fontSize:20,color:'primary.main',bgcolor:'background.paper',borderRadius:1,pointerEvents:'none'}}/></Box>
  </Box>
  {!valid&&<Typography variant="body2" color="text.secondary">{t.selectScope}</Typography>}
 </Stack>;
}
