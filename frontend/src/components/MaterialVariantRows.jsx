import TableStatusRow from './TableStatusRow';
import React from 'react';
import {IconButton,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteActionButton from './DeleteActionButton';
import {materialVariantManagementText} from '../constants/materialVariantManagement';
import {materialItemName,materialItemText} from '../constants/materialItems';

export const materialVariantOwner=(row,language)=>materialItemName(row.attributes?.owner,language)||row.attributes?.owner?.name||'';
export const materialVariantType=(row,language)=>[materialItemName(row.attributes?.type,language),['length','width','height'].map(axis=>row.attributes?.dimensions?.[axis]).filter(Boolean).join(' × ')].filter(Boolean).join(' · ');
export const materialVariantSearch=row=>[row.attributes?.owner?.name,...['owner','type','color'].flatMap(key=>['nameEn','nameKo','nameVi','code'].map(field=>row.attributes?.[key]?.[field])),...Object.values(row.attributes?.dimensions||{})].filter(Boolean).join(' ').toLocaleLowerCase();

export default function MaterialVariantRows({rows,languageCode,onEdit,onDelete,disabled,showCode=false}){
 const t=materialItemText[languageCode]||materialItemText.en;
 const m=materialVariantManagementText[languageCode]||materialVariantManagementText.en;
 return <TableContainer><Table size="small" data-table-layout="fixed" sx={{width:'100%',tableLayout:'fixed',minWidth:showCode?800:520,'& th:last-child, & tr:not([data-table-status]) > td:last-child':onEdit?{width:176}:undefined}} aria-label={t.items}><TableHead><TableRow>{[...(showCode?[t.code,t.name]:[]),t.owner,t.type,t.color,t.unit,...(onEdit?[t.actions]:[])].map(label=><TableCell key={label} align={label===t.actions?'right':'left'} sx={label===t.actions?{position:'sticky',right:0,bgcolor:'background.paper'}:undefined}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
  {rows.map(row=><TableRow key={row.id}>{showCode&&<><TableCell>{row.base?.code}</TableCell><TableCell>{materialItemName(row.base,languageCode)}</TableCell></>}<TableCell>{materialVariantOwner(row,languageCode)||'—'}</TableCell><TableCell>{materialVariantType(row,languageCode)||'—'}</TableCell><TableCell>{[row.attributes?.color?.code,materialItemName(row.attributes?.color,languageCode)].filter(Boolean).join(' · ')||'—'}</TableCell><TableCell>{materialItemName(row.unit,languageCode)||'—'}</TableCell>{onEdit&&<TableCell align="right" data-table-actions sx={{position:'sticky',right:0,bgcolor:'background.paper'}}><Stack direction="row" justifyContent="flex-end" title={row.used?m.inUse:undefined}><IconButton aria-label={m.edit} disabled={disabled||row.used||row.editable===false} onClick={()=>onEdit(row)}><EditIcon fontSize="small"/></IconButton><DeleteActionButton aria-label={m.remove} disabled={disabled||row.used} onClick={()=>onDelete(row)}/></Stack></TableCell>}</TableRow>)}
  {!rows.length&&<TableStatusRow colSpan={(onEdit?5:4)+(showCode?2:0)} languageCode={languageCode} state="empty"/>}
 </TableBody></Table></TableContainer>;
}
