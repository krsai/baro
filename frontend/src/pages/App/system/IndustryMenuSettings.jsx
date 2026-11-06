import React,{useState} from 'react';
import {Alert,Stack,Tab,Tabs,Typography} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import {useAuth} from '../../../context/AuthContext';
import {useLanguage} from '../../../context/LanguageContext';
import {subscriberAccessText} from '../../../constants/subscriberAccess';
import SubscriberMenuSettings from './SubscriberMenuSettings';

export default function IndustryMenuSettings(){
 const {activeProfile}=useAuth(),{languageCode}=useLanguage(),t=subscriberAccessText[languageCode]||subscriberAccessText.en,[orgType,setOrgType]=useState('MANUFACTURER');
 if(activeProfile?.entryType!=='SYSTEM'||activeProfile?.systemRole!=='SYSTEM_ADMIN')return <Alert severity="error">{t.denied}</Alert>;
 return <AppPageContainer title={t.title}><Stack spacing={2}>
  <Typography variant="body2" color="text.secondary">{t.note}</Typography>
  <Tabs value={orgType} onChange={(_event,value)=>setOrgType(value)}><Tab value="MANUFACTURER" label={t.factory}/><Tab value="SERVICE" label={t.logistics}/></Tabs>
  <SubscriberMenuSettings orgType={orgType}/>
 </Stack></AppPageContainer>;
}
