import React,{createContext,useCallback,useContext,useMemo,useSyncExternalStore} from 'react';
import {ThemeProvider,CssBaseline} from '@mui/material';
import {useAuth} from './AuthContext';
import {appThemes} from '../theme';
import {appearanceKey,readAppearance,writeAppearance,subscribeAppearance} from '../theme/appearancePreferences.mjs';
const AppearanceContext=createContext(null);
export const useAppearance=()=>useContext(AppearanceContext);
export default function AppearanceProvider({children}){
 const {activeProfile,user}=useAuth(),key=appearanceKey(activeProfile,user);
 const snapshot=useCallback(()=>readAppearance(key),[key]);
 const variant=useSyncExternalStore(subscribeAppearance,snapshot,()=> 'standard');
 const setVariant=useCallback(value=>writeAppearance(key,value),[key]);
 const value=useMemo(()=>({variant,setVariant}),[variant,setVariant]);
 return <AppearanceContext.Provider value={value}><ThemeProvider theme={appThemes[variant]}><CssBaseline/>{children}</ThemeProvider></AppearanceContext.Provider>;
}
