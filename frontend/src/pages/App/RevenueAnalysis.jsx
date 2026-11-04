import React,{useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,Checkbox,Chip,CircularProgress,Collapse,FormControlLabel,InputAdornment,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import PageContentStack from '../../components/PageContentStack';
import SaveButton from '../../components/SaveButton';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import {requestJSON,buildQueryString} from '../../utils/apiClient';
import {formatCurrency} from '../../utils/currencyFormat';
import {subscribeWorkspaceDataChanged} from '../../utils/workspaceDataEvents';
import {profitScenarioText} from '../../constants/profitScenario';
import {orderProfitText} from '../../constants/orderProfit';
import {PACKAGING_KEYS} from '../../utils/profitScenario.mjs';
import {orderCostDefaults,orderStyleRecordId,orderStyleProfit,orderProfitTotals,orderCommonPurchase} from '../../utils/orderProfit.mjs';

const Grid=({children})=><Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))',xl:'repeat(4,minmax(0,1fr))'},gap:2}}>{children}</Box>;
const Card=({title,children,actions})=><Paper variant="outlined" sx={{p:{xs:2,md:2.5},minWidth:0}}><Stack spacing={2}><Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}><Typography variant="h6">{title}</Typography>{actions}</Stack>{children}</Stack></Paper>;
const monetary=['baseMonthly','allowanceMonthly','supportMonthly','rentMonthly','productionPay','otherUnitCost','polyPrice','boxPrice'];
export default function RevenueAnalysis(){const {activeOrgId}=useAuth();return <OrderAnalysis key={activeOrgId} orgId={activeOrgId}/>;}
function OrderAnalysis({orgId}){
 const {languageCode}=useLanguage(),{navigateToPath}=useAppActions(),t=orderProfitText[languageCode]||orderProfitText.en,p=profitScenarioText[languageCode]||profitScenarioText.en;
 const [catalog,setCatalog]=useState({orders:[]}),[orderId,setOrderId]=useState(null),[report,setReport]=useState(null),[config,setConfig]=useState(null),[initial,setInitial]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[reload,setReload]=useState(0),[sourceReload,setSourceReload]=useState(0);
 const [search,setSearch]=useState(''),[commonOpen,setCommonOpen]=useState(false),[detail,setDetail]=useState(null),[fx,setFx]=useState(null);
 const live=useRef(true),lock=useRef(false),dirtyRef=useRef(false);
 dirtyRef.current=Boolean(config&&JSON.stringify(config)!==initial);useUnsavedChanges(dirtyRef.current);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>subscribeWorkspaceDataChanged(event=>{if(Number(event?.orgId)===Number(orgId)&&event.topics?.some(topic=>['orders','styles','issued-invoices','expense-requests','expense-approvals','bank-ledger'].includes(topic)))setSourceReload(value=>value+1);}),[orgId]);
 useEffect(()=>{
  let alive=true;setLoading(true);setError('');
  Promise.all([requestJSON('/revenue-analysis/catalog'+buildQueryString({orgId}),{skipCache:true}),requestJSON('/revenue-analysis/scenarios'+buildQueryString({orgId}),{skipCache:true})]).then(([orders,settings])=>{
   if(!alive)return;setCatalog(orders);setOrderId(current=>orders.orders.some(row=>row.id===current)?current:orders.orders[0]?.id??null);
   if(!dirtyRef.current){const next={...settings,defaults:{...orderCostDefaults(),...settings.defaults}};setConfig(next);setInitial(JSON.stringify(next));}
  }).catch(()=>{if(alive)setError(t.error);}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[orgId,reload,sourceReload]);
 useEffect(()=>{
  let alive=true;setReport(null);setDetail(null);if(!orderId)return;setBusy(true);setError('');
  requestJSON(`/revenue-analysis/orders/${orderId}`+buildQueryString({orgId}),{skipCache:true}).then(value=>{if(alive)setReport(value);}).catch(()=>{if(alive)setError(t.error);}).finally(()=>{if(alive)setBusy(false);});
  return()=>{alive=false;};
 },[orgId,orderId,reload,sourceReload]);
 useEffect(()=>{let alive=true;requestJSON('/revenue-analysis/exchange-rates'+buildQueryString({orgId}),{skipCache:true}).then(value=>{if(alive)setFx(value);}).catch(()=>{if(alive)setFx(null);});return()=>{alive=false;};},[orgId,reload]);
 const defaults=config?.defaults||orderCostDefaults(),currency=defaults.currency,rates={...fx?.rates,USD:'1',...(Number(defaults.usdVnd)>0?{VND:String(defaults.usdVnd)}:{}),...(Number(defaults.usdKrw)>0?{KRW:String(defaults.usdKrw)}:{})};
 const override=styleId=>config?.scenarios.find(row=>row.id===orderStyleRecordId(orderId,styleId))?.inputs||{};
 const rows=(report?.styles||[]).map(style=>({...style,result:orderStyleProfit(style,defaults,override(style.styleId),config?.stylePackaging?.[style.styleId],rates)}));
 const commonPurchase=orderCommonPurchase(report?.styles||[],currency,rates),totals=orderProfitTotals(rows.map(row=>row.result),report?.order.missingStyle,commonPurchase.amount),selected=rows.find(row=>row.styleId===detail);
 const money=(value,code=currency)=>value===null||value===undefined?'—':formatCurrency(value,{currencyCode:code,languageCode});
 const number=value=>value===null||value===undefined?'—':Number(value).toLocaleString(languageCode,{maximumFractionDigits:2});
 const label=row=>row?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'nameEn']||row?.name||row?.code||'';
 const disabled=loading||saving||busy;
 const change=(key,value)=>{setSaved(false);setConfig(current=>({...current,defaults:{...current.defaults,[key]:value}}));};
 const changeStyle=(style,key,value)=>{
  setSaved(false);const id=orderStyleRecordId(orderId,style.styleId);
  setConfig(current=>{const previous=current.scenarios.find(row=>row.id===id);return {...current,scenarios:[{id,name:`${report.order.orderNumber} · ${style.styleCode}`,orderId,styleId:style.styleId,inputs:{...previous?.inputs,currency,[key]:value}},...current.scenarios.filter(row=>row.id!==id)]};});
 };
 const persist=async(next=config)=>{
  if(lock.current||!next)return;lock.current=true;setSaving(true);setSaved(false);setError('');
  try{const value=await requestJSON('/revenue-analysis/scenarios'+buildQueryString({orgId}),{method:'PUT',body:JSON.stringify(next)});if(live.current){setConfig(value);setInitial(JSON.stringify(value));setSaved(true);}}
  catch(failure){if(live.current)setError(failure.message==='PROFIT_SETTINGS_CHANGED'?t.changed:t.saveError);}
  finally{lock.current=false;if(live.current)setSaving(false);}
 };
 const field=(key,value=defaults[key],onChange=next=>change(key,next))=><TextField key={key} fullWidth size="small" type="number" label={t[key]||p[key]} value={value??''} disabled={disabled||!config} onChange={event=>onChange(event.target.value)} slotProps={{htmlInput:{min:0,step:'any'},input:monetary.includes(key)?{endAdornment:<InputAdornment position="end">{{VND:'₫',USD:'$',KRW:'₩'}[currency]}</InputAdornment>}:undefined}}/>;
 const headers=['style','quantity','price','sales','purchase','days','labor','fixed','cost','profit','detail'];
 const orderList=catalog.orders.filter(row=>`${row.orderNumber} ${row.customer}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 const allCosts=[...new Map((report?.styles||[]).flatMap(row=>row.sources.costs).map(row=>[row.id,row])).values()];
 return <AppPageContainer title={t.title} titleActions={<Stack direction="row" spacing={1}><Button disabled={disabled} onClick={()=>setReload(value=>value+1)}>{t.refresh}</Button><SaveButton disabled={disabled||!config} loading={saving} onClick={()=>persist()}>{t.save}</SaveButton></Stack>}><PageContentStack>
  {error&&<Alert severity="error">{error}</Alert>}{saved&&<Alert severity="success">{t.saved}</Alert>}
  <Card title={t.orders} actions={<TextField size="small" label={t.search} value={search} onChange={event=>setSearch(event.target.value)}/> }>
   {loading&&!catalog.orders.length?<CircularProgress size={24}/>:!catalog.orders.length?<Typography>{t.empty}</Typography>:<TableContainer sx={{maxHeight:300}}><Table stickyHeader size="small" sx={{minWidth:650}}><TableHead><TableRow>{['order','customer','styles','quantity','sales','analyze'].map(key=><TableCell key={key}>{t[key]}</TableCell>)}</TableRow></TableHead><TableBody>{orderList.map(order=><TableRow key={order.id} selected={order.id===orderId} hover data-order-id={order.id}><TableCell sx={{fontWeight:600}}>{order.orderNumber}</TableCell><TableCell>{order.customer}</TableCell><TableCell>{order.styleCount}</TableCell><TableCell>{number(order.quantity)}</TableCell><TableCell>{money(order.salesAmount,order.currency)}</TableCell><TableCell><Button disabled={disabled} onClick={()=>{setOrderId(order.id);setSaved(false);}}>{t.analyze}</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>}
   {catalog.truncated&&<Typography variant="caption">{t.limited}</Typography>}
  </Card>
  {orderId&&<Card title={t.basis} actions={<Button onClick={()=>setCommonOpen(value=>!value)}>{t.settings}</Button>}>
   <Typography variant="body2" color="text.secondary">{t.basisNote}</Typography>
   <Grid><TextField select id="order-profit-basis" size="small" label={p.basis} value={defaults.basis} disabled={disabled||!config} onChange={event=>change('basis',event.target.value)}>{['ST','PT'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>{['productivity','workers','hoursDay'].map(key=>field(key))}</Grid>
   <Collapse in={commonOpen}><Stack spacing={2} sx={{pt:2}}>
    <Grid><TextField select id="order-profit-currency" size="small" label={t.currency} value={currency} disabled={disabled||!config} onChange={event=>{const next=event.target.value;setSaved(false);setConfig(current=>({...current,defaults:{...current.defaults,...Object.fromEntries(monetary.map(key=>[key,''])),currency:next}}));}}>{['VND','USD','KRW'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>{['workdays','factoryWorkers','targetDays','baseMonthly','allowanceMonthly','productionPay','supportMonthly','rentMonthly','otherUnitCost'].map(key=>field(key))}</Grid>
    <Typography variant="caption" color="text.secondary">{t.baseHint}</Typography>
    <FormControlLabel control={<Checkbox checked={defaults.packaging} disabled={disabled||!config} onChange={event=>change('packaging',event.target.checked)}/>} label={p.packaging}/>
    {defaults.packaging&&<Grid>{PACKAGING_KEYS.map(key=>field(key))}</Grid>}<Typography variant="caption" color="text.secondary">{t.packNote}</Typography>
    <Typography variant="subtitle2">{t.manualFx}</Typography><Grid>{['usdVnd','usdKrw'].map(key=>field(key))}</Grid>
   </Stack></Collapse>
   <Typography variant="caption" color="text.secondary">{t.fx}: 1 USD = {rates.VND||'—'} VND / {rates.KRW||'—'} KRW {fx?.date?` · ${fx.date}`:''} {fx?.stale?' · '+p.assumption:''}</Typography>
  </Card>}
  {busy&&<CircularProgress size={24}/>}
  {report&&<>
   <Grid>{[['sales',totals.revenue],['purchase',totals.purchase],['cost',totals.total],['profit',totals.profit]].map(([key,value])=><Paper key={key} variant="outlined" sx={{p:2}}><Typography variant="caption">{t[key]} / {currency}</Typography><Typography variant="h6" fontWeight={700} data-order-metric={key} color={key==='profit'&&value!==null?(value<0?'error.main':'success.main'):undefined}>{money(value)}</Typography></Paper>)}</Grid>
   <Card title={`${report.order.orderNumber} · ${report.order.customer}`} actions={<Chip size="small" label={t.assumed} variant="outlined"/>}>
    <Typography variant="caption" color="text.secondary">{report.order.priceSource==='ISSUED_INVOICE'?t.invoicePrice:t.currentPrice}{report.order.invoiceNumber?` · ${report.order.invoiceNumber}`:''} · {t.priceLock}</Typography>
    <TableContainer><Table size="small" sx={{minWidth:1400}}><TableHead><TableRow>{headers.map(key=><TableCell key={key} align={['style','detail'].includes(key)?'left':'right'}>{t[key]}{['sales','purchase','labor','fixed','cost','profit'].includes(key)?` (${currency})`:''}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(style=>{const r=style.result,add=values=>values.some(value=>value===null)?null:values.reduce((a,b)=>a+b,0);return <TableRow key={style.styleId} data-style-id={style.styleId} hover><TableCell><Typography variant="body2" fontWeight={600}>{style.styleCode}</Typography><Typography variant="caption">{style.styleName}</Typography></TableCell><TableCell align="right">{number(style.quantity)}</TableCell><TableCell align="right">{money(style.salePrice,style.currency)}</TableCell><TableCell align="right">{money(r.revenue)}</TableCell><TableCell align="right">{money(r.purchase)}{!r.approvedCount&&<Typography variant="caption" display="block">{t.noCosts}</Typography>}</TableCell><TableCell align="right">{number(r.days)}</TableCell><TableCell align="right">{money(add([r.costs.base,r.costs.allowance,r.costs.production]))}</TableCell><TableCell align="right">{money(add([r.costs.support,r.costs.rent]))}</TableCell><TableCell align="right">{money(r.total)}</TableCell><TableCell align="right" sx={{color:r.profit===null?undefined:r.profit<0?'error.main':'success.main',fontWeight:700}}>{money(r.profit)}<Typography variant="caption" display="block">{r.margin===null?'—':number(r.margin)+'%'}</Typography></TableCell><TableCell><Button onClick={()=>setDetail(value=>value===style.styleId?null:style.styleId)}>{t.detail}</Button></TableCell></TableRow>;})}</TableBody></Table></TableContainer>
    <Typography variant="body2">{t.period}: <strong data-order-metric="days">{number(totals.days)}</strong> · {t.margin}: {totals.margin===null?'—':number(totals.margin)+'%'}</Typography>
    {commonPurchase.rows.length>0&&<Typography variant="body2">{t.commonPurchase}: {money(commonPurchase.amount)} · {t.commonNote}</Typography>}
    <Typography variant="caption" color="text.secondary">{t.sequential} {t.costNote}</Typography>
    {report.order.missingStyle&&<Alert severity="warning">{t.missingStyle}</Alert>}
    {rows.some(row=>!row.result.ready)&&<Alert severity="warning" action={<Button onClick={()=>setCommonOpen(true)}>{t.settings}</Button>}>{t.missing} {t.fxMissing}</Alert>}
   </Card>
   {selected&&<Card title={`${selected.styleCode} · ${t.detail}`} actions={<Button onClick={()=>setDetail(null)}>{t.close}</Button>}>
    <Typography variant="subtitle2">{t.overrides}</Typography><Grid>{['stSeconds','ptSeconds'].map(key=>field(key,selected.result.input[key],value=>changeStyle(selected,key,value)))}</Grid><Typography variant="caption" color="text.secondary">{p.internalTime}</Typography>
    <Typography>{t.requiredWorkers}: {number(selected.result.requiredWorkers)} · {t.time}: {number(selected.result.input[selected.result.input.basis==='PT'?'ptSeconds':'stSeconds'])}</Typography>
    <FormControlLabel control={<Checkbox checked={selected.result.input.packaging} disabled={disabled} onChange={event=>changeStyle(selected,'packaging',event.target.checked)}/>} label={p.packaging}/>
    {selected.result.input.packaging&&<><Grid>{PACKAGING_KEYS.map(key=>field(key,selected.result.input[key],value=>changeStyle(selected,key,value)))}</Grid><Typography>{p.bags}: {number(selected.result.poly)} · {p.boxes}: {number(selected.result.boxes)}</Typography><Button disabled={disabled||!config} onClick={()=>{const pack={currency,...Object.fromEntries(PACKAGING_KEYS.map(key=>[key,selected.result.input[key]]))};persist({...config,stylePackaging:{...config.stylePackaging,[selected.styleId]:pack}});}}>{t.packingSave}</Button></>}
    {!selected.result.ready&&<Typography color="warning.main">{t.missing}: {selected.result.missing.map(key=>p[key]||t[key]||key).join(' · ')}</Typography>}
    <Typography variant="subtitle2">{p.averages}</Typography><Typography variant="caption">{p.unitWarning}</Typography>{!selected.sources.averages.length&&<Typography color="text.secondary">{p.emptyAverage}</Typography>}
    {selected.sources.averages.map(avg=><Stack key={avg.key} direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}}><Typography variant="body2">{label(avg.code)} · {avg.partner} · {label(avg.unit)} · {money(avg.unitPrice,avg.currency)} · {avg.count} {p.count}</Typography>{[['polyPrice','usePoly'],['boxPrice','useBox']].map(([key,text])=><Button key={key} disabled={avg.currency!==currency||disabled} onClick={()=>changeStyle(selected,key,Number(avg.unitPrice.toFixed(4)))}>{p[text]}</Button>)}</Stack>)}
   </Card>}
   <Card title={t.allCosts}><Typography variant="caption" color="text.secondary">{t.unallocated}</Typography><TableContainer><Table size="small" sx={{minWidth:700}}><TableHead><TableRow>{[p.date,p.reference,p.description,p.amount,p.status,t.source].map(label=><TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{allCosts.map(cost=>{const linked=rows.some(row=>row.sources.costs.some(item=>item.id===cost.id&&item.exact));return <TableRow key={cost.id}><TableCell>{cost.date}</TableCell><TableCell>{cost.reference}</TableCell><TableCell>{label(cost.code)||cost.description}</TableCell><TableCell>{money(cost.subtotal??cost.amount,cost.currency)}</TableCell><TableCell>{!cost.approved?t.pending:cost.subtotal===null?t.pretaxMissing:linked?t.included:t.shared}</TableCell><TableCell>{cost.requestId&&<Button onClick={()=>navigateToPath(`/outsourcing-record/edit/request/${cost.requestId}`)}>{t.source}</Button>}</TableCell></TableRow>;})}</TableBody></Table></TableContainer></Card>
  </>}
 </PageContentStack></AppPageContainer>;
}
