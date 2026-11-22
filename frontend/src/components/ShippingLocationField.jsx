import React,{useEffect,useState} from 'react';
import {Button,Stack,TextField} from '@mui/material';
import Alert from "./AppNotice";
import ListDetailDialog from './ListDetailDialog';
import DialogRecordList from './DialogRecordList';
import RecordDetails from './RecordDetails';
import PageActions from './PageActions';
import SearchInput from './SearchInput';
import ShippingAddressBook from './ShippingAddressBook';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {shippingEditorText} from '../constants/shippingEditor';

export default function ShippingLocationField({label,value,details,defaultParty,registeredParty,personLabel,resolveCustomer,onChange,onClose,orgId,customerId,allowPorts,allowTerminals,languageCode,disabled}){
 const [lookup,setLookup]=useState(null);
 const t=shippingEditorText[languageCode]||shippingEditorText.en;
 if(allowPorts)return <PortLookup optionalTerminal {...{label,onChange,onClose,orgId,languageCode,details,disabled}}/>;
 const current=personLabel?{label:defaultParty?.name||'',address:defaultParty?.address||'',contactName:defaultParty?.contactName||'',phone:defaultParty?.phone||'',...details,...(value?{address:value}:{})}:value||details?{...details,address:value||''}:defaultParty?{label:defaultParty.name,address:defaultParty.address,contactName:defaultParty.contactName,phone:defaultParty.phone}:{};
 return <><ShippingAddressBook locationLookup={allowTerminals?(apply,blocked)=><Stack direction="row" gap={1} flexWrap="wrap">{['SEA','AIR'].map(kind=><Button key={kind} disabled={blocked} onClick={()=>setLookup({kind,apply})}>{kind==='SEA'?t.searchSeaPort:t.searchAirport}</Button>)}</Stack>:undefined} personLabel={personLabel} resolveCustomer={resolveCustomer} title={label} testId="route-address-dialog" {...{orgId,customerId,languageCode,disabled,onClose}} current={current} registeredParty={registeredParty} onLoad={draft=>{const {address,...contact}=draft;onChange(address.trim(),null,Object.fromEntries(Object.entries(contact).map(([key,v])=>[key,v.trim()])));}}/>{lookup&&<PortLookup label={lookup.kind==='SEA'?t.searchSeaPort:t.searchAirport} kind={lookup.kind} orgId={orgId} languageCode={languageCode} onClose={()=>setLookup(null)} onChange={address=>{lookup.apply(address);setLookup(null);}}/>}</>;
}
function PortLookup({label,onChange,onClose,orgId,languageCode,details,disabled,optionalTerminal=false,kind='SEA'}){
 const t=shippingEditorText[languageCode]||shippingEditorText.en;
 const [terminalName,setTerminalName]=useState(details?.label||''),[selected,setSelected]=useState(null);
 const [query,setQuery]=useState(''),[rows,setRows]=useState([]),[error,setError]=useState(false),[loading,setLoading]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{let live=true;setLoading(true);setError(false);const timer=setTimeout(()=>{
  requestJSON('/shipping-requests/ports'+buildQueryString({orgId,q:query,kind}),{skipCache:true}).then(result=>{if(live)setRows(result.rows.map(row=>({...row,id:row.id||row.code})));}).catch(()=>{if(live){setRows([]);setError(true);}}).finally(()=>live&&setLoading(false));
 },180);return()=>{live=false;clearTimeout(timer);};},[orgId,query,reload,kind]);
 const columns=[{key:'code',width:120,label:kind==='AIR'?t.airportCode:t.portCode,value:row=>row.code},{key:'name',label:kind==='AIR'?t.airportName:t.portName,value:row=>row.name},{key:'country',label:t.country,value:row=>row.country}];
 return <ListDetailDialog open data-lookup-dialog="true" onClose={onClose} title={label} aria-label={label+' \u00b7 '+t.locationSearch}
  search={<SearchInput sx={{width:'100%'}} value={query} onChange={event=>setQuery(event.target.value)} label={t.locationSearch}/>}
  list={<DialogRecordList sx={{'& table':{minWidth:520}}} rows={rows} columns={columns} selectedKey={selected?.id} onSelect={setSelected} loading={loading} error={error} onRetry={()=>setReload(v=>v+1)} languageCode={languageCode} disabled={disabled}/>}
  frameDetail detailTitle={label} detail={<Stack spacing={2}><RecordDetails framed={false} fields={columns.map(column=>({key:column.key,label:column.label,value:selected?column.value(selected):''}))}/>{optionalTerminal&&<TextField fullWidth label={t.terminalName} value={terminalName} disabled={disabled} slotProps={{htmlInput:{maxLength:200}}} onChange={event=>setTerminalName(event.target.value)}/>}</Stack>}
  actions={<PageActions secondary={<Button onClick={onClose}>{t.close}</Button>} primary={<Button variant="contained" disabled={disabled||loading||error||!selected||!rows.some(row=>row.id===selected.id)} onClick={()=>{onChange(selected.name+' ('+selected.code+')',selected.code,optionalTerminal?{label:terminalName.trim()}:undefined);onClose();}}>{t.applyLocation}</Button>}/>}/>;
}
