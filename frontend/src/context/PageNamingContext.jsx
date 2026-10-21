import React, {createContext, useContext} from 'react';
import {useLanguage} from './LanguageContext';
import {getUiMessage} from '../constants/uiMessages';
import {resolvePageNaming} from '../utils/pageNaming.mjs';

const PageNamingContext = createContext(null);
export const usePageNaming = () => useContext(PageNamingContext);
// Each cached outlet keeps its own path, including while another tab is active.
export function PageNamingProvider({path,children}) {
  const {languageCode} = useLanguage();
  const value = resolvePageNaming(path,languageCode,key=>getUiMessage(key,key,languageCode));
  return <PageNamingContext.Provider value={value}>{children}</PageNamingContext.Provider>;
}
