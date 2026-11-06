import React,{useState} from 'react';
import {Box,Tab,Tabs} from '@mui/material';
import HolidayBoard from './holiday/HolidayBoard';
import EmployeeLeaveBoard from './holiday/EmployeeLeaveBoard';
import {useLanguage} from '../../context/LanguageContext';
import {employeeLeaveText} from '../../constants/employeeLeave';

const Holiday = () => {
  const [tab,setTab]=useState(0),[leaveVisited,setLeaveVisited]=useState(false),{languageCode}=useLanguage(),t=employeeLeaveText[languageCode]||employeeLeaveText.en;
  return <Box><Tabs value={tab} onChange={(_,value)=>{setTab(value);if(value===1)setLeaveVisited(true);}} sx={{px:3,mb:2}}><Tab label={t.company}/><Tab label={t.title}/></Tabs><Box hidden={tab!==0}><HolidayBoard/></Box>{leaveVisited&&<Box hidden={tab!==1}><EmployeeLeaveBoard/></Box>}</Box>;
};

export default Holiday;
