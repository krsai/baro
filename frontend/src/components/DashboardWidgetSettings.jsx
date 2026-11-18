import React,{createContext,useContext} from 'react';
import {IconButton} from '@mui/material';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';

export const DashboardWidgetSettingsContext=createContext(null);
export default function DashboardWidgetSettings(){
 const settings=useContext(DashboardWidgetSettingsContext);
 return settings?<IconButton size="small" aria-label={settings.label} title={settings.label} onClick={settings.open}><SettingsOutlinedIcon fontSize="small"/></IconButton>:null;
}
