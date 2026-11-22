import React,{useEffect,useState} from 'react';
import LookupInput from './LookupInput';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {shippingPartyChoices} from '../utils/shippingParties.mjs';

// Resolve only a fully loaded company/customer scope; failures go to the retryable book.
export default function ShippingLookupInput({orgId,customerId,kind='PARTY',parties=[],fixedPartyId,excludedParty,value,onChange,onSearch,...props}){
 const [query,setQuery]=useState(''),[catalog,setCatalog]=useState(null);
 const scope=JSON.stringify([orgId,customerId,kind,fixedPartyId,query]);
 useEffect(()=>{
  let live=true;setCatalog(null);
  if(!customerId)return;
  const timer=setTimeout(async()=>{
   try{
    const presets=await requestJSON('/shipping-requests/presets'+buildQueryString({orgId,customerId,kind}),{skipCache:true});
    const directory=kind==='PARTY'&&!fixedPartyId?await requestJSON('/shipping-requests/parties'+buildQueryString({orgId,customerId,...(query.trim().length>=2?{query:query.trim()}:{})}),{skipCache:true}):[];
    if(live)setCatalog({presets,directory,scope});
   }catch{if(live)setCatalog(null);}
  },180);
  return()=>{live=false;clearTimeout(timer);};
 },[orgId,customerId,kind,fixedPartyId,query]);
 const rows=!catalog||catalog.scope!==scope||catalog.directory.length>=21?[]:kind==='REQUESTER'?catalog.presets.map(row=>({...row.data,id:row.id})):shippingPartyChoices([...parties,...catalog.directory].filter((row,index,all)=>all.findIndex(other=>other.id===row.id)===index),catalog.presets,{fixedPartyId,excludedParty}).map(row=>({...row.data,id:row.id,partyId:row.partyId,code:row.code,directoryParty:row.directoryParty,searchNames:row.searchNames}));
 return <LookupInput {...props} value={value} options={rows} getLabel={row=>row.name||''} getValues={row=>[...(row.searchNames||[])]} onInputChange={(_,text,reason)=>{if(reason==='input'){setCatalog(null);setQuery(text);}}} onChange={row=>onChange(row&&kind==='PARTY'?{...row,id:row.partyId??null}:row)} onSearch={onSearch}/>;
}

