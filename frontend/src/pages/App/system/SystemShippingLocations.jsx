import React,{useState} from 'react';
import {Stack,Tab,Tabs} from '@mui/material';
import {useSearchParams} from 'react-router-dom';
import AppPageContainer from '../../../components/AppPageContainer';
import {useLanguage} from '../../../context/LanguageContext';
import {getUiMessage} from '../../../constants/uiMessages';
import SystemShippingPorts from './SystemShippingPorts';
import SystemShippingAirports from './SystemShippingAirports';
const labels={ko:['해상 항만','항공 공항'],en:['Seaports','Airports'],vi:['Cảng biển','Sân bay']};
export default function SystemShippingLocations(){
 const {languageCode}=useLanguage(),t=labels[languageCode]||labels.en;
 const [params,setParams]=useSearchParams(),[locked,setLocked]=useState(false);
 const mode=params.get('mode')==='AIR'?'AIR':'SEA';
 return <AppPageContainer title={getUiMessage('menu.shippingPorts','Ports & airports',languageCode)}><Stack spacing={2}>
 <Tabs value={mode} onChange={(_,value)=>setParams(value==='AIR'?{mode:'AIR'}:{},{replace:true})}>
 <Tab id="shipping-sea-tab" aria-controls="shipping-sea-panel" value="SEA" label={t[0]} disabled={locked}/>
 <Tab id="shipping-air-tab" aria-controls="shipping-air-panel" value="AIR" label={t[1]} disabled={locked}/>
 </Tabs>
 <div role="tabpanel" id={mode==='SEA'?'shipping-sea-panel':'shipping-air-panel'} aria-labelledby={mode==='SEA'?'shipping-sea-tab':'shipping-air-tab'}>
 {mode==='SEA'?<SystemShippingPorts embedded onLockChange={setLocked}/>:<SystemShippingAirports embedded/>}
 </div>
 </Stack></AppPageContainer>;
}
