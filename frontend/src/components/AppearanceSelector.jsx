import React,{useId} from 'react';
import {FormControl,InputLabel,Select,MenuItem} from '@mui/material';
import {useAppearance} from '../context/AppearanceContext';
import {useLanguage} from '../context/LanguageContext';
import {appearanceText} from '../constants/appearance';
export default function AppearanceSelector(){
 const id=useId(),{languageCode}=useLanguage(),appearance=useAppearance(),t=appearanceText[languageCode]||appearanceText.en;
 if(!appearance)return null;
 return <FormControl fullWidth size="small"><InputLabel id={id}>{t.label}</InputLabel><Select labelId={id} label={t.label} value={appearance.variant} onChange={event=>appearance.setVariant(event.target.value)}><MenuItem value="standard">{t.standard}</MenuItem><MenuItem value="compact">{t.compact}</MenuItem></Select></FormControl>;
}
