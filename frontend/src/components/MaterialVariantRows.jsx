import React from 'react';
import {Table,TableBody,TableCell,TableContainer,TableHead,TableRow} from '@mui/material';
import {materialItemName,materialItemText} from '../constants/materialItems';

export const materialVariantOwner=(row,language)=>materialItemName(row.attributes?.owner,language)||row.attributes?.owner?.name||'';
export const materialVariantType=(row,language)=>[materialItemName(row.attributes?.type,language),['length','width','height'].map(axis=>row.attributes?.dimensions?.[axis]).filter(Boolean).join(' × ')].filter(Boolean).join(' · ');
export const materialVariantSearch=row=>[row.attributes?.owner?.name,...['owner','type','color'].flatMap(key=>['nameEn','nameKo','nameVi','code'].map(field=>row.attributes?.[key]?.[field])),...Object.values(row.attributes?.dimensions||{})].filter(Boolean).join(' ').toLocaleLowerCase();

export default function MaterialVariantRows({rows,languageCode}){
 const t=materialItemText[languageCode]||materialItemText.en;
 return <TableContainer><Table size="small" aria-label={t.items}><TableHead><TableRow>{[t.owner,t.type,t.color,t.unit].map(label=><TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
  {rows.map(row=><TableRow key={row.id}><TableCell>{materialVariantOwner(row,languageCode)||'—'}</TableCell><TableCell>{materialVariantType(row,languageCode)||'—'}</TableCell><TableCell>{[row.attributes?.color?.code,materialItemName(row.attributes?.color,languageCode)].filter(Boolean).join(' · ')||'—'}</TableCell><TableCell>{materialItemName(row.unit,languageCode)||'—'}</TableCell></TableRow>)}
  {!rows.length&&<TableRow><TableCell colSpan={4}>{t.noItems}</TableCell></TableRow>}
 </TableBody></Table></TableContainer>;
}
