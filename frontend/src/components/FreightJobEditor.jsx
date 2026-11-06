import React,{useState} from 'react';
import {Alert,Box,Button,Checkbox,FormControlLabel,MenuItem,Paper,Stack,TextField,Typography} from '@mui/material';
import AppPageContainer from './AppPageContainer';
import ExpenseLookupField from './ExpenseLookupField';
import SaveButton from './SaveButton';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {useLanguage} from '../context/LanguageContext';
import {freightJobEditorText} from '../constants/freightJobEditor';
const grid={display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',md:'repeat(3,minmax(0,1fr))'},gap:2};
function Section({title,children}){return <Paper variant="outlined" sx={{p:2.5}}><Typography variant="subtitle1" fontWeight={700} sx={{mb:2}}>{title}</Typography>{children}</Paper>;}
export function FreightJobDetails({job,name}){
 const {languageCode}=useLanguage(),e=freightJobEditorText[languageCode]||freightJobEditorText.en,d=job.data;
 const item=(label,value)=><Box key={label} sx={{minWidth:0}}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" sx={{overflowWrap:'anywhere'}}>{value||'—'}</Typography></Box>;
 return <Stack spacing={2}><Section title={e.parties}><Box sx={grid}>{['shipper','consignee','notify'].map(role=><Box key={role}>{item(e[role],d[role+'Party']?name(d[role+'Party']):d[role])}<Typography variant="caption" color="text.secondary">{d[role+'Party']?.address}</Typography></Box>)}</Box></Section><Section title={e.cargoInfo}><Box sx={grid}>{item(e.shipmentType,e[d.shipmentType]||job.mode)}{item(e.incoterms,d.incoterms)}{item(e.cargo,d.cargo)}{['quantity','unit','weightKg','cbm',...(d.shipmentType==='FCL'?['containerType','containerCount']:[]),'etd','eta'].map(key=>item(e[key],d[key]))}{d.pickupRequired&&item(e.pickupAddress,d.pickupAddress)}{d.dangerousGoods&&item(e.dangerousGoods,d.dangerousGoodsDetails||e.dangerousGoods)}</Box></Section></Stack>;
}
export default function FreightJobEditor({t,options,initial,onClose,onSave,busy,name}){
 const {languageCode}=useLanguage(),e=freightJobEditorText[languageCode]||freightJobEditorText.en;
 const [value,setValue]=useState(initial),[failed,setFailed]=useState(false);useUnsavedChanges(JSON.stringify(value)!==JSON.stringify(initial));
 const data=(key,v)=>setValue(row=>({...row,data:{...row.data,[key]:v}}));
 const field=(key,type='text',label=e[key]||t[key])=><TextField key={key} size="small" label={label} type={type} value={value.data[key]??''} onChange={event=>data(key,event.target.value)} slotProps={{inputLabel:{shrink:type==='date'||undefined},htmlInput:{maxLength:key==='cargo'?2000:1000,...(type==='number'?{min:0,step:key==='quantity'||key==='containerCount'?1:'any'}:{})}}}/>;
 const lookup=(label,rows,current,change,required=false)=><Stack spacing={.75}><ExpenseLookupField label={label} options={rows} value={current} onChange={change} required={required} disabled={busy} languageCode={languageCode} getOptionLabel={row=>row.code||row.employeeNo||''} getCode={row=>row.code||row.employeeNo||''} columns={[{key:'code',label:e.code,value:row=>row.code||row.employeeNo||''},{key:'name',label:e.name,value:name},{key:'address',label:e.address,value:row=>row.address||''}]}/><Typography variant="body2" sx={{minHeight:20,overflowWrap:'anywhere'}}>{current?name(current):'—'}</Typography></Stack>;
 const party=role=>options.customers.find(row=>row.id===value.data[role+'Id'])||value.data[role+'Party']||null;
 const shipment=value.data.shipmentType||(value.mode==='SEA'?'FCL':value.mode==='AIR'?'AIR':'ROAD');
 return <AppPageContainer header={<Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h5" component="h1" fontWeight={700}>{initial.id?`${t.edit} · ${initial.number}`:t.new}</Typography><Stack direction="row" spacing={1}><Button disabled={busy} onClick={onClose}>{t.cancel}</Button><SaveButton loading={busy} disabled={!value.customerId||!value.data.shipperId||!value.data.consigneeId} onClick={()=>onSave(value).catch(()=>setFailed(true))}>{t.save}</SaveButton></Stack></Stack>}><Stack spacing={2} sx={{'& .MuiInputBase-root':{bgcolor:'background.paper'}}}>
 {failed&&<Alert severity="error">{t.failed}</Alert>}
 <Section title={e.basics}><Box sx={grid}>
 {lookup(t.customer,options.customers,options.customers.find(row=>row.id===value.customerId)||value.data.customer||null,row=>setValue(v=>({...v,customerId:row?.id??null,data:{...v.data,customer:row}})),true)}
 {lookup(t.assignee,options.employees,options.employees.find(row=>row.id===value.data.assigneeId)||null,row=>data('assigneeId',row?.id??null))}
 <TextField size="small" select label={t.jobType} value={value.data.jobType||'OTHER'} onChange={event=>data('jobType',event.target.value)}>{['IMPORT','EXPORT','DOMESTIC','OTHER'].map(key=><MenuItem key={key} value={key}>{t[key]}</MenuItem>)}</TextField>
 <TextField size="small" select label={e.shipmentType} value={shipment} onChange={event=>setValue(v=>({...v,mode:['FCL','LCL'].includes(event.target.value)?'SEA':event.target.value,data:{...v.data,shipmentType:event.target.value}}))}>{['FCL','LCL','AIR','ROAD'].map(key=><MenuItem key={key} value={key}>{e[key]}</MenuItem>)}</TextField>
 {field('incoterms')}{field('plannedDate','date')}
 </Box></Section>
 <Section title={e.parties}><Box sx={grid}>{['shipper','consignee','notify'].map(role=><Box key={role} sx={{p:1.5,bgcolor:'background.default',borderRadius:1.5,minWidth:0}}>{lookup(e[role],options.customers,party(role),row=>setValue(v=>({...v,data:{...v.data,[role+'Id']:row?.id??null,[role+'Party']:row}})),role!=='notify')}<Typography variant="caption" color="text.secondary" sx={{display:'block',mt:1,overflowWrap:'anywhere'}}>{party(role)?.address||'—'}</Typography></Box>)}</Box></Section>
 <Section title={e.route}><Box sx={{...grid,gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'}}}>{field('origin')}{field('destination')}{field('etd','date')}{field('eta','date')}</Box><FormControlLabel sx={{mt:1}} control={<Checkbox checked={value.data.pickupRequired===true} onChange={event=>data('pickupRequired',event.target.checked)}/>} label={e.pickupRequired}/>{value.data.pickupRequired&&<Box sx={{mt:1,display:'grid'}}>{field('pickupAddress')}</Box>}</Section>
 <Section title={e.cargoInfo}><Stack spacing={2}>{field('cargo')}<Box sx={{...grid,gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))',lg:'repeat(4,minmax(0,1fr))'}}}>{field('quantity','number')}{field('unit')}{field('weightKg','number')}{field('cbm','number')}{shipment==='FCL'&&<>{field('containerType')}{field('containerCount','number')}</>}</Box><FormControlLabel control={<Checkbox checked={value.data.dangerousGoods===true} onChange={event=>data('dangerousGoods',event.target.checked)}/>} label={e.dangerousGoods}/>{value.data.dangerousGoods&&field('dangerousGoodsDetails')}</Stack></Section>
 <TextField size="small" label={t.remark} multiline minRows={2} value={value.data.remark||''} onChange={event=>data('remark',event.target.value)} slotProps={{htmlInput:{maxLength:2000}}}/>
 </Stack></AppPageContainer>;
}
