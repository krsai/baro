import Dialog from './AppDialog';
import React,{useId,useState} from 'react';
import {DialogContent,DialogTitle,IconButton,Stack,Tooltip,Typography} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {useLanguage} from '../context/LanguageContext';

const LABELS={ko:{info:'설명 보기'},en:{info:'View explanation'},vi:{info:'Xem giải thích'}};
// Explanatory content belongs to the feature; interaction and language selection are shared.
export default function InformationButton({content,languageCode,renderContent}){
 const language=useLanguage(),lang=languageCode||language.languageCode||'en';
 const text=content[lang]||content.en,labels=LABELS[lang]||LABELS.en;
 const [open,setOpen]=useState(false),titleId=useId(),bodyId=useId();
 return <><Tooltip title={labels.info}><IconButton size="small" aria-label={text.title+' · '+labels.info} aria-haspopup="dialog" onClick={event=>{event.stopPropagation();setOpen(true);}}><InfoOutlinedIcon fontSize="small"/></IconButton></Tooltip>
  <Dialog open={open} onClose={()=>setOpen(false)} fullWidth maxWidth="sm" aria-labelledby={titleId} aria-describedby={bodyId}>
   <DialogTitle id={titleId}>{text.title}</DialogTitle><DialogContent id={bodyId}>{renderContent?renderContent(text):<Stack spacing={1.5}>{text.paragraphs.map((paragraph,index)=><Typography key={index} variant="body2" sx={{overflowWrap:'anywhere'}}>{paragraph}</Typography>)}</Stack>}</DialogContent>
  </Dialog></>;
}
