import React,{useEffect,useMemo,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {Box,List,ListItemButton,Paper,Typography} from '@mui/material';
import ChevronRight from '@mui/icons-material/ChevronRight';
import AppPageContainer from '../../components/AppPageContainer';
import CustomerList from './customer/CustomerList';
import BusinessPartners from './BusinessPartners';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {canAccessPath} from '../../utils/accessControl';
import {getUiMessage} from '../../constants/uiMessages';

export default function TradePartners({initialType='CUSTOMER'}){
 const auth=useAuth(),{languageCode}=useLanguage(),location=useLocation();
 const labels={ko:{type:'거래처 구분',denied:'조회할 수 있는 거래처 구분이 없습니다.'},en:{type:'Partner type',denied:'You do not have access to any partner type.'},vi:{type:'Loại đối tác',denied:'Bạn chưa có quyền xem loại đối tác nào.'}}[languageCode]||{type:'Partner type',denied:'You do not have access to any partner type.'};
 const options=useMemo(()=>[
  {id:'CUSTOMER',path:'/customer',label:getUiMessage('menu.customer','Customer',languageCode)},
  {id:'PROCESS_OUTSOURCING',path:'/outsourcing-partner',label:getUiMessage('menu.outsourcingPartner','Outsourcing Partner',languageCode)},
  {id:'MATERIAL_SUPPLIER',path:'/material-supplier',label:getUiMessage('menu.materialSupplier','Material Supplier',languageCode)},
 ].filter(option=>canAccessPath(option.path,auth)),[auth,languageCode]);
 const [selected,setSelected]=useState(()=>location.state?.partnerType||initialType);
 useEffect(()=>{if(location.state?.partnerType)setSelected(location.state.partnerType);},[location.key]);
 const current=options.find(option=>option.id===selected)||options[0];
 return <AppPageContainer title={getUiMessage('menu.partners','Partners',languageCode)}>
  <Paper variant="outlined" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'220px minmax(0,1fr)'},overflow:'hidden'}}>
   <Box component="nav" aria-label={labels.type} sx={{p:2,borderRight:{md:1},borderBottom:{xs:1,md:0},borderColor:'divider'}}>
    <Typography variant="subtitle2" sx={{mb:1}}>{labels.type}</Typography>
    <List disablePadding>{options.map(option=><ListItemButton key={option.id} selected={current?.id===option.id} aria-current={current?.id===option.id?'true':undefined} onClick={()=>setSelected(option.id)} sx={{borderRadius:1,mb:.5}}>
     <Typography sx={{flex:1}}>{option.label}</Typography><ChevronRight fontSize="small"/>
    </ListItemButton>)}</List>
   </Box>
   <Box key={`${auth.activeOrgId}:${current?.id}`} sx={{p:2,minWidth:0}}>{!current?<Typography>{labels.denied}</Typography>:current.id==='CUSTOMER'?<CustomerList embedded/>:<BusinessPartners embedded type={current.id}/>}</Box>
  </Paper>
 </AppPageContainer>;
}
