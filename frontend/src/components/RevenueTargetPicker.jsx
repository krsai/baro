import React,{useEffect,useState} from 'react';
import {Alert,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,Radio,Stack,Tab,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Tabs,TextField,Typography,useMediaQuery,useTheme} from '@mui/material';
import {revenueSelectionText} from '../constants/revenueSelection';
import {orderProfitText} from '../constants/orderProfit';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {formatCurrency} from '../utils/currencyFormat';
export default function RevenueTargetPicker({open,onClose,onSelect,orders,orderStyles=[],orgId,languageCode,selection}){
 const t=revenueSelectionText[languageCode]||revenueSelectionText.en,o=orderProfitText[languageCode]||orderProfitText.en,theme=useTheme(),small=useMediaQuery(theme.breakpoints.down('sm'));
 const [mode,setMode]=useState('ORDER'),[search,setSearch]=useState(''),[order,setOrder]=useState(null),[style,setStyle]=useState(null),[quantity,setQuantity]=useState(''),[gender,setGender]=useState(''),[styles,setStyles]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{if(open){setMode(selection?.mode||'ORDER');setOrder(orders.find(row=>row.id===selection?.orderId)||null);setStyle(selection?.style||null);setQuantity(selection?.quantity??'');setGender(selection?.gender||'');setSearch('');}},[open]);
 useEffect(()=>{
  if(!open||mode!=='STYLE')return;let live=true;const controller=new AbortController();setBusy(true);setError(false);
  const timer=setTimeout(()=>requestJSON('/revenue-analysis/styles'+buildQueryString({orgId,search}),{skipCache:true,signal:controller.signal}).then(value=>{if(live)setStyles(value.styles);}).catch(failure=>{if(live&&failure.name!=='AbortError')setError(true);}).finally(()=>{if(live)setBusy(false);}),180);
  return()=>{live=false;clearTimeout(timer);controller.abort();};
 },[open,mode,orgId,search,reload]);
 const filtered=orders.filter(row=>`${row.orderNumber} ${row.customer}`.toLowerCase().includes(search.toLowerCase())),valid=Number.isSafeInteger(Number(quantity))&&Number(quantity)>0&&Number(quantity)<=1000000000;
 const choose=()=>{if(mode==='ORDER'&&order)onSelect({mode,orderId:order.id});else if(mode==='STYLE'&&style&&valid)onSelect({mode,style,quantity:Number(quantity),gender:gender||null});};
 return <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={small}>
  <DialogTitle>{t.title}</DialogTitle><DialogContent dividers><Stack spacing={2}>
   <Tabs value={mode} onChange={(_,value)=>{setMode(value);setSearch('');}} variant="fullWidth"><Tab value="ORDER" label={t.orders}/><Tab value="STYLE" label={t.styles}/></Tabs>
   <TextField size="small" fullWidth label={t.search} value={search} onChange={event=>setSearch(event.target.value)}/>
   <Typography variant="body2" color="text.secondary">{mode==='ORDER'?t.orderHint:t.styleHint}</Typography>
   {error&&<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{t.error}</Alert>}
   {busy&&<CircularProgress size={24}/>}
   <TableContainer sx={{maxHeight:420}}><Table size="small" stickyHeader><TableHead><TableRow>{['',mode==='ORDER'?o.order:o.style,o.customer,mode==='ORDER'?o.quantity:o.style,mode==='ORDER'?o.sales:''].map((header,index)=><TableCell key={index}>{header}</TableCell>)}</TableRow></TableHead><TableBody>
    {mode==='ORDER'?filtered.map(row=><TableRow key={row.id} hover selected={order?.id===row.id} onClick={()=>setOrder(row)} sx={{cursor:'pointer'}} data-order-option={row.id}><TableCell><Radio checked={order?.id===row.id} onChange={()=>setOrder(row)} inputProps={{'aria-label':row.orderNumber}}/></TableCell><TableCell><Typography fontWeight={600}>{row.orderNumber}</Typography><Typography variant="caption">{row.styleCount} {o.styles}</Typography></TableCell><TableCell>{row.customer}</TableCell><TableCell>{row.quantity.toLocaleString()}</TableCell><TableCell>{row.salesAmount==null?'—':formatCurrency(row.salesAmount,{currencyCode:row.currency,languageCode})}</TableCell></TableRow>):styles.map(row=><TableRow key={row.id} hover selected={style?.id===row.id} onClick={()=>{setStyle(row);}} sx={{cursor:'pointer'}} data-style-option={row.id}><TableCell><Radio checked={style?.id===row.id} onChange={()=>setStyle(row)} inputProps={{'aria-label':row.code}}/></TableCell><TableCell><Typography fontWeight={600}>{row.code}</Typography></TableCell><TableCell>{row.customer}</TableCell><TableCell colSpan={2}>{row.name}</TableCell></TableRow>)}
   </TableBody></Table></TableContainer>
   {!busy&&(mode==='ORDER'?!filtered.length:!styles.length)&&<Typography color="text.secondary">{t.empty}</Typography>}
   {mode==='ORDER'&&order&&orderStyles.some(row=>row.orderId===order.id)&&<Stack spacing={.5}><Typography variant="subtitle2">{order.orderNumber}</Typography>{orderStyles.filter(row=>row.orderId===order.id).map(row=><Stack key={row.styleId} direction="row" justifyContent="space-between" spacing={2}><Typography variant="body2">{row.styleCode}</Typography><Typography variant="body2">{row.quantity.toLocaleString()} · {row.salesAmount==null?'—':formatCurrency(row.salesAmount,{currencyCode:row.currency,languageCode})}</Typography></Stack>)}</Stack>}
   {mode==='STYLE'&&<Stack spacing={1}><Typography variant="subtitle2">{style?`${style.code} · ${style.name}`:t.quantityHint}</Typography><Stack direction={{xs:'column',sm:'row'}} spacing={2}><TextField size="small" type="number" label={t.quantity} value={quantity} onChange={event=>setQuantity(event.target.value)} slotProps={{htmlInput:{min:1,step:1}}}/><TextField select id="revenue-style-gender" size="small" label={t.gender} value={gender} onChange={event=>setGender(event.target.value)} sx={{minWidth:180}} slotProps={{select:{displayEmpty:true},inputLabel:{shrink:true}}}>{[['',t.unspecified],['M',t.male],['W',t.female],['U',t.unisex]].map(([value,label])=><MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField></Stack></Stack>}
  </Stack></DialogContent><DialogActions><Button onClick={onClose}>{t.close}</Button><Button variant="contained" disabled={mode==='ORDER'?!order:!style||!valid||busy} onClick={choose}>{t.apply}</Button></DialogActions>
 </Dialog>;
}
