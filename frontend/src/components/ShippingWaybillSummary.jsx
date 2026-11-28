import React from 'react';
import {Box,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Typography} from '@mui/material';
import InvoiceSheet from './InvoiceSheet';
import InvoiceDocumentField from './InvoiceDocumentField';
import {freightText} from '../constants/freight';
import {freightWorkflowText} from '../constants/freightWorkflow';
import {shippingModeLabel,shippingRequestDate} from '../utils/shippingPresentation';
import {shippingWorkbenchText} from '../constants/shippingWorkbench';
import {routeScopeText} from '../constants/freightRouteScope';
import {routeLocations} from '../utils/shippingRoute.mjs';

export default function ShippingWaybillSummary({job,languageCode}){
 const f=freightText[languageCode]||freightText.en,w=freightWorkflowText[languageCode]||freightWorkflowText.en,t=shippingWorkbenchText[languageCode]||shippingWorkbenchText.en,d=job.data,locations=routeLocations(d,job.mode),r=routeScopeText[languageCode]||routeScopeText.en;
 const field=(label,value,multiline=false)=><InvoiceDocumentField key={label} label={label} value={value||'—'} readOnly multiline={multiline}/>;
 const party=role=>{const value=d[role+'Party'];return value?[value.name,value.address,[value.contactName,value.phone,value.email].filter(Boolean).join(' / ')].filter(Boolean).join('\n'):d[role];};
 const type=d.documentSetup?.documentType||(job.service==='EXPRESS'?'WAYBILL':job.mode==='SEA'?'BILL_OF_LADING':job.mode==='AIR'?'AIR_WAYBILL':'WAYBILL');
 return <InvoiceSheet data-shipping-bill-sheet><Box sx={{p:{xs:2,md:3}}}>
  <Box className="invoice-document-top"><Typography component="h2" className="invoice-heading">{w[type]}</Typography><Box className="invoice-document-identifiers">{field('Master',job.bills?.filter(row=>row.kind==='MASTER').map(row=>row.number).join(' / '))}{field('House',job.bills?.filter(row=>row.kind==='HOUSE').map(row=>row.number).join(' / '))}</Box></Box>
  <Box className="invoice-parties">{field(f.shipper,party('shipper'),true)}{field(f.consignee,party('consignee'),true)}{field(f.notify,d.notifySameAsConsignee?party('consignee'):party('notify'),true)}<Box className="invoice-metadata">{field(t.summaryDate,shippingRequestDate(job))}{field(f.mode,shippingModeLabel(job,languageCode))}{d.plannedDate&&field('CARGO READY DATE',d.plannedDate)}</Box></Box>
  <Box className="invoice-metadata" sx={{mt:2}}>{field(f.origin,d.origin,true)}{field(f.destination,d.destination,true)}{field(f.vessel,[d.vessel,d.voyage].filter(Boolean).join(' / '))}{locations.ORIGIN_TERMINAL&&field(job.mode==='AIR'?r.originAirport:r.ORIGIN_TERMINAL,locations.ORIGIN_TERMINAL,true)}{locations.DESTINATION_TERMINAL&&field(job.mode==='AIR'?r.destinationAirport:r.DESTINATION_TERMINAL,locations.DESTINATION_TERMINAL,true)}{field('ETD / ETA',[d.etd,d.eta].filter(Boolean).join(' / '))}</Box>
 </Box><TableContainer><Table data-table-kind="summary" size="small" className="invoice-lines" data-table-layout="document" sx={{minWidth:620}}><TableHead><TableRow>{[f.marks,f.quantity,f.cargo,f.weightKg,f.cbm].map(label=><TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody><TableRow><TableCell>{d.marks||'—'}</TableCell><TableCell>{[d.quantity,d.unit].filter(Boolean).join(' ')||d.containerCount||'—'}</TableCell><TableCell sx={{whiteSpace:'pre-wrap'}}>{d.cargo||'—'}{d.containers?.map((row,index)=><Typography key={index} variant="body2">{row.size}' {row.type} × {row.count}</Typography>)}</TableCell><TableCell align="right">{d.weightKg||'—'}</TableCell><TableCell align="right">{d.cbm||'—'}</TableCell></TableRow></TableBody></Table></TableContainer><Stack sx={{p:2}} spacing={1}>{field(f.freightTerms,[d.freightTerms,d.incoterms].filter(Boolean).join(' / '))}{d.remark&&field(f.remark,d.remark,true)}</Stack></InvoiceSheet>;
}
