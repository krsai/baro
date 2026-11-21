import React from 'react';
import {Box,Button,Stack} from '@mui/material';
import {ui} from '../theme/ui';
import {getCurrentLanguageCode} from '../utils/appLanguage';
const text={ko:{previous:'이전',next:'다음',label:'페이지 이동'},en:{previous:'Previous',next:'Next',label:'Pagination'},vi:{previous:'Trước',next:'Tiếp',label:'Phân trang'}};

// Callers own actual page/count/cursor rules. No fake totals or data fetching.
export default function ListPagination({onPrevious,onNext,previousDisabled,nextDisabled,previousLabel,nextLabel,leading,children,inset=true,languageCode=getCurrentLanguageCode()}){
 const t=text[languageCode]||text.en;
 return <Stack component="nav" aria-label={t.label} data-list-pagination direction="row" useFlexGap flexWrap="wrap" alignItems="center" justifyContent="flex-end" sx={{gap:ui.layout.actionGap,px:inset?1.5:0,py:1,minHeight:52,minWidth:0}}>
  {leading&&<Box sx={{mr:'auto',minWidth:0}}>{leading}</Box>}
  <Button disabled={previousDisabled} onClick={onPrevious}>{previousLabel||t.previous}</Button>
  {children}
  <Button disabled={nextDisabled} onClick={onNext}>{nextLabel||t.next}</Button>
 </Stack>;
}
