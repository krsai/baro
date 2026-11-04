import React,{useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,Checkbox,Chip,CircularProgress,Collapse,Drawer,FormControlLabel,InputAdornment,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
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
import {revenueUxText} from '../../constants/revenueUx';
import {revenueSelectionText} from '../../constants/revenueSelection';
import RevenueTargetPicker from '../../components/RevenueTargetPicker';
import {PACKAGING_KEYS} from '../../utils/profitScenario.mjs';
import {orderCostDefaults,orderStyleRecordId,orderStyleProfit,orderProfitTotals,orderCommonPurchase} from '../../utils/orderProfit.mjs';

const Grid=({children})=><Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},gap:2}}>{children}</Box>;
const Card=({title,children,actions})=><Paper variant="outlined" sx={{p:{xs:2,md:2.5},minWidth:0}}><Stack spacing={2}><Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}><Typography variant="h6">{title}</Typography>{actions}</Stack>{children}</Stack></Paper>;
const monetary=['baseMonthly','allowanceMonthly','supportMonthly','rentMonthly','productionPay','otherUnitCost','polyPrice','boxPrice'];
const monthNow=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}).slice(0,7);
export default function RevenueAnalysis(){const {activeOrgId}=useAuth();return <OrderAnalysis key={activeOrgId} orgId={activeOrgId}/>;}
function OrderAnalysis({orgId}){
 const {languageCode}=useLanguage(),{navigateToPath}=useAppActions(),t=orderProfitText[languageCode]||orderProfitText.en,p=profitScenarioText[languageCode]||profitScenarioText.en,u=revenueUxText[languageCode]||revenueUxText.en;
 const s=revenueSelectionText[languageCode]||revenueSelectionText.en;
 const [mode,setMode]=useState('ORDER'),[standalone,setStandalone]=useState(null),[pickerOpen,setPickerOpen]=useState(false);
 const [catalog,setCatalog]=useState({orders:[]}),[orderId,setOrderId]=useState(null),[report,setReport]=useState(null),[config,setConfig]=useState(null),[initial,setInitial]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[reload,setReload]=useState(0),[sourceReload,setSourceReload]=useState(0);
 const [commonOpen,setCommonOpen]=useState(false),[detail,setDetail]=useState(null),[fx,setFx]=useState(null),[costOpen,setCostOpen]=useState(false);
 const [month,setMonth]=useState(monthNow),[labor,setLabor]=useState(null),[laborBusy,setLaborBusy]=useState(false),[laborError,setLaborError]=useState(false);
 const live=useRef(true),lock=useRef(false),dirtyRef=useRef(false);
 dirtyRef.current=Boolean(config&&JSON.stringify(config)!==initial);useUnsavedChanges(dirtyRef.current);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>subscribeWorkspaceDataChanged(event=>{if(Number(event?.orgId)===Number(orgId)&&event.topics?.some(topic=>['orders','styles','issued-invoices','expense-requests','expense-approvals','bank-ledger','salary-system-settings','employees'].includes(topic)))setSourceReload(value=>value+1);}),[orgId]);
 useEffect(()=>{
  let alive=true;setLoading(true);setError('');
  Promise.all([requestJSON('/revenue-analysis/catalog'+buildQueryString({orgId}),{skipCache:true}),requestJSON('/revenue-analysis/scenarios'+buildQueryString({orgId}),{skipCache:true})]).then(([orders,settings])=>{
   if(!alive)return;setCatalog(orders);setOrderId(current=>orders.orders.some(row=>row.id===current)?current:orders.orders[0]?.id??null);
   if(!dirtyRef.current){const next={...settings,defaults:{...orderCostDefaults(),...settings.defaults}};setConfig(next);setInitial(JSON.stringify(next));}
  }).catch(()=>{if(alive)setError(t.error);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};
 },[orgId,reload,sourceReload]);
 useEffect(()=>{
  let alive=true;setReport(null);setDetail(null);if(mode==='ORDER'&&!orderId||mode==='STYLE'&&!standalone){setBusy(false);return;}setBusy(true);setError('');
  const request=mode==='ORDER'?requestJSON(`/revenue-analysis/orders/${orderId}`+buildQueryString({orgId}),{skipCache:true}):requestJSON('/revenue-analysis/style-analysis'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify({styleId:standalone.style.id,quantity:standalone.quantity,gender:standalone.gender})});
  request.then(value=>{if(alive)setReport(value);}).catch(()=>{if(alive)setError(t.error);}).finally(()=>{if(alive)setBusy(false);});return()=>{alive=false;};
 },[orgId,orderId,mode,standalone,reload,sourceReload]);
 useEffect(()=>{let alive=true;requestJSON('/revenue-analysis/exchange-rates'+buildQueryString({orgId}),{skipCache:true}).then(value=>{if(alive)setFx(value);}).catch(()=>{if(alive)setFx(null);});return()=>{alive=false;};},[orgId,reload]);
 useEffect(()=>{let alive=true;setLabor(null);setLaborBusy(true);setLaborError(false);requestJSON('/revenue-analysis/labor-basis'+buildQueryString({orgId,month}),{skipCache:true}).then(value=>{if(alive)setLabor(value);}).catch(()=>{if(alive)setLaborError(true);}).finally(()=>{if(alive)setLaborBusy(false);});return()=>{alive=false;};},[orgId,month,reload,sourceReload]);
 const defaults=config?.defaults||orderCostDefaults(),currency=defaults.currency,rates={...fx?.rates,USD:'1',...(Number(defaults.usdVnd)>0?{VND:String(defaults.usdVnd)}:{}),...(Number(defaults.usdKrw)>0?{KRW:String(defaults.usdKrw)}:{})};
 const assignedFactory=report?.order.factoryIds?.length===1?report.order.factoryIds[0]:null;
 const basis=labor?.factories.find(row=>row.id===Number(defaults.factoryId))||labor?.factories.find(row=>row.id===assignedFactory)||labor?.factories.find(row=>row.directCount>0)||null;
 const analysisOrderId=mode==='ORDER'?orderId:null;
 const override=styleId=>config?.scenarios.find(row=>row.id===orderStyleRecordId(analysisOrderId,styleId))?.inputs||{};
 const rows=(report?.styles||[]).map(style=>({...style,result:orderStyleProfit(style,defaults,override(style.styleId),config?.stylePackaging?.[style.styleId],rates,laborBusy?null:{...basis,company:labor?.company})}));
 const commonPurchase=orderCommonPurchase(report?.styles||[],currency,rates),totals=orderProfitTotals(rows.map(row=>row.result),report?.order.missingStyle,commonPurchase.amount),selected=rows.find(row=>row.styleId===detail);
 const knownSalary=rows.reduce((sum,row)=>sum+row.result.labor,0),salaryComplete=rows.length>0&&rows.every(row=>row.result.laborComplete),salaryMissing=[...new Set(rows.flatMap(row=>row.result.laborMissing))];
 const salaryAvailable=rows.some(row=>['base','allowance','production','support'].some(key=>row.result.costs[key]!==null&&row.result.costs[key]>0))||salaryComplete;
 const money=(value,code=currency)=>value===null||value===undefined?'—':formatCurrency(value,{currencyCode:code,languageCode});
 const number=value=>value===null||value===undefined?'—':Number(value).toLocaleString(languageCode,{maximumFractionDigits:2});
 const label=row=>row?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'nameEn']||row?.name||row?.code||'';
 const disabled=loading||saving||busy;
 const change=(key,value)=>{setSaved(false);setConfig(current=>({...current,defaults:{...current.defaults,[key]:value}}));};
 const changeStyle=(style,key,value)=>{setSaved(false);const id=orderStyleRecordId(analysisOrderId,style.styleId);setConfig(current=>{const previous=current.scenarios.find(row=>row.id===id);return {...current,scenarios:[{id,name:`${report.order.orderNumber} · ${style.styleCode}`,orderId:analysisOrderId,styleId:style.styleId,inputs:{...previous?.inputs,currency,[key]:value}},...current.scenarios.filter(row=>row.id!==id)]};});};
 const persist=async(next=config)=>{
  if(lock.current||!next)return;lock.current=true;setSaving(true);setSaved(false);setError('');
  try{const value=await requestJSON('/revenue-analysis/scenarios'+buildQueryString({orgId}),{method:'PUT',body:JSON.stringify(next)});if(live.current){setConfig(value);setInitial(JSON.stringify(value));setSaved(true);}}
  catch(failure){if(live.current)setError(failure.message==='PROFIT_SETTINGS_CHANGED'?t.changed:t.saveError);}finally{lock.current=false;if(live.current)setSaving(false);}
 };
 const field=(key,value=defaults[key],onChange=next=>change(key,next))=><TextField key={key} fullWidth size="small" type="number" label={t[key]||p[key]} value={value??''} disabled={disabled||!config} onChange={event=>onChange(event.target.value)} slotProps={{htmlInput:{min:0,step:'any'},input:monetary.includes(key)?{endAdornment:<InputAdornment position="end">{{VND:'₫',USD:'$',KRW:'₩'}[currency]}</InputAdornment>}:undefined}}/>;
 const allCosts=[...new Map((report?.styles||[]).flatMap(row=>row.sources.costs).map(row=>[row.id,row])).values()];
 const openSettings=()=>{setDetail(null);setCommonOpen(true);};
 const drawerSx={width:{xs:'100vw',sm:540},maxWidth:'100vw',boxSizing:'border-box',p:2.5};
 return <AppPageContainer title={t.title} titleActions={<Stack direction="row" spacing={1}><Button disabled={disabled} onClick={()=>setReload(value=>value+1)}>{t.refresh}</Button><SaveButton disabled={disabled||!config} loading={saving} onClick={()=>persist()}>{t.save}</SaveButton></Stack>}><PageContentStack>
  {error&&<Alert severity="error">{error}</Alert>}{saved&&<Alert severity="success">{t.saved}</Alert>}
  <Paper variant="outlined" sx={{p:2}}><Stack direction={{xs:'column',md:'row'}} spacing={2} alignItems={{md:'center'}}>
   <Box sx={{flex:1,minWidth:0}}><Typography variant="caption" color="text.secondary">{mode==='ORDER'?s.orders:s.standalone}</Typography><Typography variant="h6">{report?.order.orderNumber||t.select}</Typography></Box>
   <Button variant="contained" disabled={disabled} onClick={()=>setPickerOpen(true)}>{s.choose}</Button>
   <TextField size="small" type="month" label={u.month} value={month} disabled={disabled} onChange={event=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value))setMonth(event.target.value);}} sx={{width:{xs:'100%',md:170}}} slotProps={{inputLabel:{shrink:true}}}/>
  </Stack></Paper>
  <Stack direction={{xs:'column',md:'row'}} spacing={2} alignItems={{md:'center'}}>
   <Box sx={{flex:1,minWidth:0}}><Typography variant="h6">{report?.order.orderNumber||t.select}</Typography><Typography variant="body2" color="text.secondary">{report?.order.customer} {report?` · ${number(report.order.quantity)} · ${report.styles.length} ${t.styles}`:''}</Typography></Box>
   <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{'& .MuiTextField-root':{width:{xs:130,md:140}}}}><TextField select id="order-profit-basis" size="small" label={p.basis} value={defaults.basis} disabled={disabled||!config} onChange={event=>change('basis',event.target.value)}>{['ST','PT'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>{['productivity','workers'].map(key=>field(key))}<Button variant="outlined" onClick={openSettings}>{u.costBasis}</Button></Stack>
  </Stack>
  {(loading||busy)&&<CircularProgress size={24}/>}
  {report&&<>
   <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',lg:'repeat(4,minmax(0,1fr))'},gap:1.5}}>
    {[['sales',t.sales,totals.revenue],['purchase',mode==='STYLE'?s.estimatePurchase:t.purchase,totals.purchase],['salary',u.salary,salaryAvailable?knownSalary:null],['profit',t.profit,totals.profit]].map(([key,title,value])=><Paper key={key} variant="outlined" sx={{p:2,minWidth:0}}><Typography variant="caption" color="text.secondary">{title} · {currency}</Typography><Typography variant="h6" fontWeight={700} sx={{overflowWrap:'anywhere'}} data-order-metric={key} color={key==='profit'&&value!==null?(value<0?'error.main':'success.main'):undefined}>{money(value)}</Typography>{key==='salary'&&<Typography variant="caption" color={salaryComplete?'text.secondary':'warning.main'}>{laborBusy?'…':salaryComplete?u.complete:salaryAvailable?u.partial:u.salaryMissing}</Typography>}{key==='profit'&&<Typography variant="caption">{u.totalCost}: {money(totals.total)}</Typography>}</Paper>)}
   </Box>
   {labor?.company&&<Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}><Chip size="small" label={`${s.allEmployees}: ${labor.company.employeeCount} ${s.people}`}/>{[['GENERAL',s.office],['OUTPUT_FIXED',s.productionFixed],['OUTPUT',s.productionVariable]].map(([key,title])=><Chip key={key} size="small" variant="outlined" label={`${title} ${labor.company.counts[key]} ${s.people}`}/>)}{labor.company.excludedCount>0&&<Chip size="small" label={`${s.excluded}: ${labor.company.excludedCount}`}/>}</Stack>}
   {!salaryComplete&&!laborBusy&&<Alert severity="warning" action={<Button onClick={openSettings}>{u.fill}</Button>}>{u.salaryMissing}: {salaryMissing.map(key=>p[key]||key).join(' · ')}{labor?.company?.unresolvedCount>0?` · ${s.unresolved}: ${labor.company.unresolvedCount} ${s.people}`:!basis?' · '+u.noSource:''}</Alert>}
   <Card title={u.overview} actions={<Chip size="small" variant="outlined" label={`${number(totals.days)} ${u.days}`}/>}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}><Typography variant="caption" color="text.secondary">{t.currency}: {currency} · {defaults.laborSource!=='MANUAL'&&labor?.company?s.companyPayroll:u.manual}</Typography><Typography variant="caption" color="text.secondary">{report.order.priceSource==='ISSUED_INVOICE'?t.invoicePrice:t.currentPrice}</Typography></Stack>
    <TableContainer><Table size="small" sx={{minWidth:1000}}><TableHead><TableRow>{[t.style,t.sales,t.purchase,t.days,u.salary,u.rent,t.profit,t.detail].map((header,index)=><TableCell key={index} align={index===0||index===7?'left':'right'} sx={{whiteSpace:'nowrap'}}>{header}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(style=>{const r=style.result;return <TableRow key={style.styleId} data-style-id={style.styleId} hover><TableCell><Typography fontWeight={600} variant="body2">{style.styleCode}</Typography><Typography variant="caption" color="text.secondary">{number(style.quantity)} · {money(style.salePrice,style.currency)}</Typography></TableCell><TableCell align="right">{money(r.revenue)}</TableCell><TableCell align="right">{money(r.purchase)}</TableCell><TableCell align="right">{number(r.days)}<Typography variant="caption" display="block" color="text.secondary">{number(r.workloadHours)} {u.hours}</Typography></TableCell><TableCell align="right" data-style-salary={style.styleId}>{money(r.laborComplete||r.labor>0?r.labor:null)}{!r.laborComplete&&<Button size="small" onClick={openSettings}>{u.fill}</Button>}</TableCell><TableCell align="right">{money(r.costs.rent)}{r.costs.rent===null&&<Typography variant="caption" color="warning.main" display="block">{u.rentMissing}</Typography>}</TableCell><TableCell align="right" sx={{fontWeight:700,color:r.profit===null?undefined:r.profit<0?'error.main':'success.main'}}>{money(r.profit)}<Typography variant="caption" display="block">{r.margin===null?'—':number(r.margin)+'%'}</Typography></TableCell><TableCell><Button size="small" onClick={()=>setDetail(style.styleId)}>{t.detail}</Button></TableCell></TableRow>;})}<TableRow data-profit-totals sx={{bgcolor:'action.hover','& td':{fontWeight:700}}}><TableCell>{s.totals}<Typography variant="caption" display="block">{number(report.order.quantity)}</Typography></TableCell><TableCell align="right">{money(totals.revenue)}</TableCell><TableCell align="right">{money(totals.purchase)}</TableCell><TableCell align="right">{number(totals.days)}</TableCell><TableCell align="right">{money(salaryAvailable?knownSalary:null)}</TableCell><TableCell align="right">{money(rows.every(row=>row.result.costs.rent!==null)?rows.reduce((sum,row)=>sum+row.result.costs.rent,0):null)}</TableCell><TableCell align="right">{money(totals.profit)}</TableCell><TableCell/></TableRow></TableBody></Table></TableContainer>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}><Typography variant="body2">{t.period}: <strong data-order-metric="days">{number(totals.days)}</strong> {u.days}</Typography><Typography variant="caption" color="text.secondary">{t.sequential}</Typography></Stack>
    {commonPurchase.rows.length>0&&<Typography variant="body2">{t.commonPurchase}: {money(commonPurchase.amount)} · {t.commonNote}</Typography>}{report.order.missingStyle&&<Alert severity="warning">{t.missingStyle}</Alert>}
   </Card>
   <Button sx={{alignSelf:'flex-start'}} onClick={()=>setCostOpen(value=>!value)}>{u.costs} · {allCosts.length}</Button>
   <Collapse in={costOpen}><Card title={u.costs}><Typography variant="caption" color="text.secondary">{mode==='STYLE'?s.historyOnly:t.costNote}</Typography><TableContainer><Table size="small" sx={{minWidth:700}}><TableHead><TableRow>{[p.date,p.reference,p.description,p.amount,p.status,t.source].map(header=><TableCell key={header}>{header}</TableCell>)}</TableRow></TableHead><TableBody>{allCosts.map(cost=>{const linked=rows.some(row=>row.sources.costs.some(item=>item.id===cost.id&&item.exact));return <TableRow key={cost.id}><TableCell>{cost.date}</TableCell><TableCell>{cost.reference}</TableCell><TableCell>{label(cost.code)||cost.description}</TableCell><TableCell>{money(cost.subtotal??cost.amount,cost.currency)}</TableCell><TableCell>{!cost.approved?t.pending:cost.subtotal===null?t.pretaxMissing:linked?t.included:t.shared}</TableCell><TableCell>{cost.requestId&&<Button onClick={()=>navigateToPath(`/outsourcing-record/edit/request/${cost.requestId}`)}>{t.source}</Button>}</TableCell></TableRow>;})}</TableBody></Table></TableContainer></Card></Collapse>
  </>}
  <Drawer anchor="right" open={commonOpen} onClose={()=>setCommonOpen(false)} slotProps={{paper:{sx:drawerSx}}}><Stack spacing={2}>
   <Stack direction="row" justifyContent="space-between"><Typography variant="h6">{u.costBasis}</Typography><Button onClick={()=>setCommonOpen(false)}>{t.close}</Button></Stack>
   <TextField select id="profit-labor-mode" size="small" label={u.mode} value={defaults.laborSource||'AUTO'} disabled={disabled||!config} onChange={event=>change('laborSource',event.target.value)}><MenuItem value="AUTO">{s.companyPayroll}</MenuItem><MenuItem value="MANUAL">{u.manualOption}</MenuItem></TextField>
   {laborError&&<Alert severity="warning">{u.salaryUnavailable}</Alert>}
   {defaults.laborSource!=='MANUAL'&&labor?.company&&<Alert severity="info">{s.companyPayroll} · {month} · {labor.company.employeeCount} {s.people}<Typography variant="caption" display="block">{s.companyFormula}</Typography></Alert>}
   <Grid><TextField select id="order-profit-currency" size="small" label={u.currency} value={currency} disabled={disabled||!config} onChange={event=>setConfig(current=>({...current,defaults:{...current.defaults,...Object.fromEntries(monetary.map(key=>[key,''])),currency:event.target.value}}))}>{['VND','USD','KRW'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>{['hoursDay','workdays','targetDays','rentMonthly','otherUnitCost'].map(key=>field(key))}</Grid>
   {(defaults.laborSource==='MANUAL'||!basis?.directCount)&&<Grid>{['factoryWorkers','baseMonthly','allowanceMonthly','productionPay','supportMonthly'].map(key=>field(key))}</Grid>}
   <Typography variant="caption" color="text.secondary">{u.regular}</Typography>
   <FormControlLabel control={<Checkbox checked={defaults.packaging} disabled={disabled||!config} onChange={event=>change('packaging',event.target.checked)}/>} label={p.packaging}/>{defaults.packaging&&<Grid>{PACKAGING_KEYS.map(key=>field(key))}</Grid>}<Typography variant="caption" color="text.secondary">{t.packNote}</Typography>
   <Grid>{['usdVnd','usdKrw'].map(key=>field(key))}</Grid><Typography variant="caption">{t.fx}: 1 USD = {rates.VND||'—'} VND / {rates.KRW||'—'} KRW {fx?.date?` · ${fx.date}`:''}</Typography><SaveButton disabled={disabled||!config} loading={saving} onClick={()=>persist()}>{t.save}</SaveButton>
  </Stack></Drawer>
  <Drawer anchor="right" open={Boolean(selected)} onClose={()=>setDetail(null)} slotProps={{paper:{sx:drawerSx}}}>{selected&&<Stack spacing={2}>
   <Stack direction="row" justifyContent="space-between"><Typography variant="h6">{selected.styleCode} · {t.detail}</Typography><Button onClick={()=>setDetail(null)}>{t.close}</Button></Stack>
   <Typography>{number(selected.quantity)} · {money(selected.result.revenue)}</Typography>
   <Typography variant="subtitle2">{u.salaryBreakdown}</Typography>{(selected.result.laborBreakdown?[['officeFixed',s.officePay],['productionFixed',s.productionFixedPay],['variableBase',s.variableBasePay],['variableAllowance',s.variableAllowancePay],['variableProduction',s.variableProductionPay]]:[['base',u.base],['allowance',u.allowance],['production',u.production],['support',u.support]]).map(([key,title])=><Stack key={key} direction="row" justifyContent="space-between"><Typography variant="body2">{title}</Typography><Typography variant="body2">{money((selected.result.laborBreakdown||selected.result.costs)[key])}</Typography></Stack>)}
   {!selected.result.laborComplete&&<Alert severity="warning" action={<Button onClick={openSettings}>{u.fill}</Button>}>{u.missing}: {selected.result.laborMissing.map(key=>p[key]||key).join(' · ')}</Alert>}
   <Grid>{['stSeconds','ptSeconds'].map(key=>field(key,selected.result.input[key],value=>changeStyle(selected,key,value)))}</Grid><Typography variant="caption" color="text.secondary">{p.internalTime}</Typography>
   <FormControlLabel control={<Checkbox checked={selected.result.input.packaging} disabled={disabled} onChange={event=>changeStyle(selected,'packaging',event.target.checked)}/>} label={p.packaging}/>
   {selected.result.input.packaging&&<><Grid>{PACKAGING_KEYS.map(key=>field(key,selected.result.input[key],value=>changeStyle(selected,key,value)))}</Grid><Typography>{p.bags}: {number(selected.result.poly)} · {p.boxes}: {number(selected.result.boxes)}</Typography><Button disabled={disabled} onClick={()=>persist({...config,stylePackaging:{...config.stylePackaging,[selected.styleId]:{currency,...Object.fromEntries(PACKAGING_KEYS.map(key=>[key,selected.result.input[key]]))}}})}>{t.packingSave}</Button></>}
   {!selected.result.ready&&<Typography variant="body2" color="warning.main">{u.missing}: {selected.result.missing.map(key=>p[key]||t[key]||key).join(' · ')}</Typography>}
   <Typography variant="subtitle2">{p.averages}</Typography>{!selected.sources.averages.length&&<Typography variant="body2" color="text.secondary">{p.emptyAverage}</Typography>}{selected.sources.averages.map(avg=><Box key={avg.key}><Typography variant="body2">{label(avg.code)} · {avg.partner} · {label(avg.unit)} · {money(avg.unitPrice,avg.currency)}</Typography><Stack direction="row" spacing={1}>{[['polyPrice','usePoly'],['boxPrice','useBox']].map(([key,text])=><Button key={key} disabled={avg.currency!==currency||disabled} onClick={()=>changeStyle(selected,key,Number(avg.unitPrice.toFixed(4)))}>{p[text]}</Button>)}</Stack></Box>)}
  </Stack>}</Drawer>
  <RevenueTargetPicker open={pickerOpen} onClose={()=>setPickerOpen(false)} orders={catalog.orders} orderStyles={catalog.rows||[]} orgId={orgId} languageCode={languageCode} selection={mode==='ORDER'?{mode,orderId}:{...standalone,mode}} onSelect={value=>{setMode(value.mode);if(value.mode==='ORDER')setOrderId(value.orderId);else setStandalone(value);setPickerOpen(false);setSaved(false);}}/>
 </PageContentStack></AppPageContainer>;
}
