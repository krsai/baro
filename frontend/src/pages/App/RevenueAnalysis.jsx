import React,{useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,Checkbox,Chip,CircularProgress,FormControlLabel,InputAdornment,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import PageContentStack from '../../components/PageContentStack';
import SaveButton from '../../components/SaveButton';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import {requestJSON,buildQueryString} from '../../utils/apiClient';
import {formatCurrency} from '../../utils/currencyFormat';
import {profitScenarioText} from '../../constants/profitScenario';
import {PACKAGING_KEYS,calculateProfitScenario,createProfitInputs,trialProfitInputs} from '../../utils/profitScenario.mjs';

const Grid=({children})=><Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))',xl:'repeat(3,minmax(0,1fr))'},gap:2}}>{children}</Box>;
const Card=({title,children,actions})=><Paper variant="outlined" sx={{p:{xs:2,md:2.5},minWidth:0}}><Stack spacing={2}><Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}><Typography variant="h6">{title}</Typography>{actions}</Stack>{children}</Stack></Paper>;
const snapshot=(input,target,name)=>JSON.stringify({input,target,name});
const MONEY_KEYS=['salePrice','baseMonthly','allowanceMonthly','supportMonthly','rentMonthly','productionPay','otherUnitCost','polyPrice','boxPrice'];
const changeCurrency=(input,currency)=>input.currency===currency?input:{...input,...Object.fromEntries(MONEY_KEYS.map(key=>[key,''])),currency};
export default function RevenueAnalysis(){const {activeOrgId}=useAuth();return <Analysis key={activeOrgId} orgId={activeOrgId}/>;}
function Analysis({orgId}){
 const {languageCode}=useLanguage(),{navigateToPath}=useAppActions(),t=profitScenarioText[languageCode]||profitScenarioText.en;
 const [input,setInput]=useState(createProfitInputs),[target,setTarget]=useState(''),[name,setName]=useState(''),[scenarioId,setScenarioId]=useState('');
 const [initial,setInitial]=useState(()=>snapshot(createProfitInputs(),'','')),[settings,setSettings]=useState(null),[catalog,setCatalog]=useState({rows:[]}),[sources,setSources]=useState(null);
 const [loading,setLoading]=useState(true),[sourceBusy,setSourceBusy]=useState(false),[sourceError,setSourceError]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false),[reload,setReload]=useState(0);
 const alive=useRef(true),lock=useRef(false),applyTimes=useRef(false),edited=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useUnsavedChanges(snapshot(input,target,name)!==initial);
 useEffect(()=>{
  let live=true;setLoading(true);setError('');
  Promise.allSettled([requestJSON('/revenue-analysis/catalog'+buildQueryString({orgId}),{skipCache:true}),requestJSON('/revenue-analysis/scenarios'+buildQueryString({orgId}),{skipCache:true})]).then(([orders,stored])=>{
   if(!live)return;
   if(orders.status==='fulfilled')setCatalog(orders.value);else setError(t.error);
   if(stored.status==='fulfilled'){setSettings(stored.value);if(!edited.current){const next={...createProfitInputs(),...stored.value.defaults};setInput(next);setInitial(snapshot(next,'',''));}}else setError(t.error);
  }).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[orgId,reload]);
 const selected=catalog.rows.find(row=>row.key===target),targetParts=target?target.split(':').map(Number):null;
 useEffect(()=>{
  let live=true;setSources(null);setSourceError(false);
  if(!target){setSourceBusy(false);return;}
  setSourceBusy(true);const [orderId,styleId]=target.split(':').map(Number);
  requestJSON('/revenue-analysis/sources'+buildQueryString({orgId,orderId,styleId}),{skipCache:true}).then(value=>{
   if(!live)return;setSources(value);if(applyTimes.current)setInput(current=>({...current,stSeconds:value.times.ST??'',ptSeconds:value.times.PT??''}));applyTimes.current=false;
  }).catch(()=>{if(live){setSourceError(true);applyTimes.current=false;}}).finally(()=>{if(live)setSourceBusy(false);});
  return()=>{live=false;};
 },[orgId,target,reload]);
 const change=(key,value)=>{edited.current=true;setInput(current=>({...current,[key]:value}));setNotice('');};
 const chooseTarget=value=>{
  edited.current=true;applyTimes.current=true;setTarget(value);setScenarioId('');setNotice('');
  const row=catalog.rows.find(item=>item.key===value),base={...createProfitInputs(),...settings?.defaults},currency=row?.currency||base.currency,next=changeCurrency(base,currency),pack=row?settings?.stylePackaging?.[row.styleId]:null;
  if(pack)for(const key of PACKAGING_KEYS){if(!['polyPrice','boxPrice'].includes(key)||pack.currency===currency)next[key]=pack[key]??next[key];}
  setInput({...next,quantity:row?.quantity??'',salePrice:row?.salePrice??'',currency,stSeconds:'',ptSeconds:''});setName(row?`${row.orderNumber} · ${row.styleCode}`:'');
 };
 const reset=()=>{edited.current=false;applyTimes.current=false;const next={...createProfitInputs(),...settings?.defaults};setInput(next);setTarget('');setName('');setScenarioId('');setInitial(snapshot(next,'',''));setNotice('');};
 const loadScenario=id=>{const row=settings?.scenarios.find(item=>item.id===id);if(!row)return;edited.current=true;applyTimes.current=false;const next={...createProfitInputs(),...row.inputs},nextTarget=row.orderId?`${row.orderId}:${row.styleId}`:'';setScenarioId(id);setName(row.name);setTarget(nextTarget);setInput(next);setInitial(snapshot(next,nextTarget,row.name));setNotice('');};
 const persist=async(next,clearDirty=false)=>{
  if(lock.current||!settings)return;lock.current=true;setSaving(true);setError('');setNotice('');
  try{const value=await requestJSON('/revenue-analysis/scenarios'+buildQueryString({orgId}),{method:'PUT',body:JSON.stringify(next)});if(alive.current){setSettings(value);setNotice(t.savedOk);if(clearDirty)setInitial(snapshot(input,target,name));}return true;}
  catch(failure){if(alive.current)setError(failure.message==='PROFIT_SETTINGS_CHANGED'?t.changed:t.saveError);return false;}
  finally{lock.current=false;if(alive.current)setSaving(false);}
 };
 const save=async()=>{const id=scenarioId||crypto.randomUUID(),record={id,name:name.trim()||(selected?`${selected.orderNumber} · ${selected.styleCode}`:t.trialName),orderId:targetParts?.[0]??null,styleId:targetParts?.[1]??null,inputs:input};if(await persist({...settings,scenarios:[record,...settings.scenarios.filter(row=>row.id!==id)]},true))setScenarioId(id);};
 const saveDefaults=()=>{const {quantity,salePrice,stSeconds,ptSeconds,...defaults}=input;persist({...settings,defaults:{...defaults,costMode:'estimate'}});};
 const saveStyle=()=>{if(targetParts)persist({...settings,stylePackaging:{...settings.stylePackaging,[targetParts[1]]:{currency:input.currency,...Object.fromEntries(PACKAGING_KEYS.map(key=>[key,input[key]]))}}});};
 const linkedCosts=(sources?.costs||[]).filter(row=>row.exact&&row.approved&&row.subtotal!==null&&row.currency===input.currency),linkedAmount=linkedCosts.reduce((sum,row)=>sum+Number(row.subtotal),0);
 const result=calculateProfitScenario(input,{linkedAmount:sourceBusy||sourceError||!sources?null:linkedAmount});
 const money=value=>value===null||value===undefined?'—':formatCurrency(value,{currencyCode:input.currency,languageCode}),decimal=value=>value===null||value===undefined?'—':Number(value).toLocaleString(languageCode,{maximumFractionDigits:2});
 const label=row=>row?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'nameEn']||row?.name||row?.code||'';
 const disabled=loading||saving||sourceBusy,monetary=MONEY_KEYS;
 const field=key=><TextField key={key} size="small" fullWidth type="number" label={t[key]} value={input[key]} disabled={disabled} onChange={event=>change(key,event.target.value)} slotProps={{htmlInput:{min:0,step:'any'},input:monetary.includes(key)?{endAdornment:<InputAdornment position="end">{{VND:'₫',USD:'$',KRW:'₩'}[input.currency]}</InputAdornment>}:undefined}}/>;
 const metric=(key,value,highlight=false)=><Stack key={key} direction="row" justifyContent="space-between" spacing={2} sx={{py:.5}}><Typography variant="body2" color="text.secondary">{t[key]}</Typography><Typography variant={highlight?'h6':'body2'} fontWeight={highlight?700:500} sx={{textAlign:'right',overflowWrap:'anywhere'}} data-profit-metric={key}>{value}</Typography></Stack>;
 return <AppPageContainer title={t.title} titleActions={<Stack direction="row" spacing={1}><Button disabled={disabled} onClick={reset}>{t.new}</Button><SaveButton loading={saving} disabled={disabled||!settings} onClick={save}>{t.save}</SaveButton></Stack>}>
  <PageContentStack>
   <Alert severity="info">{t.intro}</Alert>
   {error&&<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{error}</Alert>}{notice&&<Alert severity="success">{notice}</Alert>}{loading&&<CircularProgress size={24}/>}
   <Card title={t.target} actions={<Chip size="small" color="warning" variant="outlined" label={t.assumption}/>}>
    <Grid>
     <TextField select id="profit-saved" size="small" label={t.saved} value={scenarioId} disabled={disabled||!settings} onChange={event=>loadScenario(event.target.value)} slotProps={{select:{displayEmpty:true},inputLabel:{shrink:true}}}><MenuItem value="">—</MenuItem>{settings?.scenarios.map(row=><MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>)}</TextField>
     <TextField select id="profit-target" size="small" label={t.order} value={target} disabled={disabled} onChange={event=>chooseTarget(event.target.value)} slotProps={{select:{displayEmpty:true},inputLabel:{shrink:true}}}><MenuItem value="">{t.manual}</MenuItem>{target&&!selected&&<MenuItem value={target}>{name}</MenuItem>}{catalog.rows.map(row=><MenuItem key={row.key} value={row.key}>{row.orderNumber} · {row.styleCode} · {row.customer}</MenuItem>)}</TextField>
     <TextField size="small" label={t.name} value={name} disabled={disabled} onChange={event=>{edited.current=true;setName(event.target.value);}} slotProps={{htmlInput:{maxLength:120}}}/>
     <TextField select id="profit-currency" size="small" label={t.currency} value={input.currency} disabled={disabled} onChange={event=>{edited.current=true;setInput(current=>changeCurrency(current,event.target.value));setNotice('');}}>{['VND','USD','KRW'].map(code=><MenuItem key={code} value={code}>{code}</MenuItem>)}</TextField>{field('quantity')}{field('salePrice')}
    </Grid>
    <Typography variant="caption" color="text.secondary">{t.sourceNote} {selected?.invoiceNumber?`${t.sourcePrice}: ${selected.invoiceNumber}`:t.missingPrice}</Typography><Typography variant="caption" color="text.secondary">{t.noFx} {t.pretax}</Typography>
    {catalog.truncated&&<Alert severity="warning">{t.limited}</Alert>}
    <Stack direction={{xs:'column',sm:'row'}} spacing={1}>
     <Button disabled={disabled} onClick={()=>{edited.current=true;setTarget('');setScenarioId('');setName(t.trialName);setInput(trialProfitInputs());setNotice(t.trialNote);}}>{t.trial}</Button>
     {selected&&<Button disabled={disabled} onClick={()=>{edited.current=true;setInput(current=>({...changeCurrency(current,selected.currency||current.currency),quantity:selected.quantity,salePrice:selected.salePrice??'',stSeconds:sources?.times.ST??'',ptSeconds:sources?.times.PT??''}));}}>{t.restore}</Button>}
     {scenarioId&&<Button color="error" disabled={disabled} onClick={async()=>{if(window.confirm(t.confirmRemove)&&await persist({...settings,scenarios:settings.scenarios.filter(row=>row.id!==scenarioId)}))reset();}}>{t.remove}</Button>}
    </Stack>
   </Card>
   <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',lg:'minmax(0,1.5fr) minmax(300px,1fr)'},gap:2,alignItems:'start'}}>
    <Stack spacing={2} sx={{minWidth:0}}>
     <Card title={t.production}><Grid><TextField select id="profit-basis" size="small" label={t.basis} value={input.basis} disabled={disabled} onChange={event=>change('basis',event.target.value)}>{['ST','PT'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>{['stSeconds','ptSeconds','productivity','workers','targetDays','hoursDay','workdays','factoryWorkers'].map(field)}</Grid><Stack direction="row" spacing={1}>{[100,120,140].map(value=><Button key={value} disabled={disabled} variant={Number(input.productivity)===value?'contained':'outlined'} onClick={()=>change('productivity',value)}>{value}%</Button>)}</Stack><Typography variant="caption" color="text.secondary">{t.internalTime}</Typography>{sources?.version&&<Typography variant="caption">{t.sourceVersion}: {sources.version}</Typography>}</Card>
     <Card title={t.payroll}><Grid>{['baseMonthly','allowanceMonthly','productionPay','supportMonthly','rentMonthly'].map(field)}</Grid><Typography variant="caption" color="text.secondary">{t.salaryNote}</Typography></Card>
     <Card title={t.pack}><FormControlLabel control={<Checkbox checked={input.packaging} disabled={disabled} onChange={event=>change('packaging',event.target.checked)}/>} label={t.packaging}/>{input.packaging&&<Grid>{PACKAGING_KEYS.map(field)}</Grid>}<Typography variant="caption" color="text.secondary">{t.packingNote}</Typography><Stack direction={{xs:'column',sm:'row'}} spacing={1}><Button disabled={disabled||!settings} onClick={saveDefaults}>{t.saveDefaults}</Button><Button disabled={disabled||!settings||!target} onClick={saveStyle}>{t.saveStyle}</Button></Stack><Typography variant="caption" color="text.secondary">{t.defaultNote}</Typography></Card>
     <Card title={t.direct}>
      <TextField select id="profit-cost-mode" size="small" label={t.costMode} value={input.costMode} disabled={disabled} onChange={event=>{change('costMode',event.target.value);if(event.target.value==='linked')change('packaging',false);}}><MenuItem value="estimate">{t.estimate}</MenuItem><MenuItem value="linked" disabled={!target}>{t.linked}</MenuItem></TextField>
      {input.costMode==='estimate'?field('otherUnitCost'):<>{metric('linkedAmount',money(result.costs.direct))}<Alert severity="warning">{t.costWarning}</Alert></>}
      {sourceError&&<Alert severity="warning" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{t.sourceError}</Alert>}
      <Typography variant="subtitle2">{t.averages}</Typography><Typography variant="caption" color="text.secondary">{t.unitWarning}</Typography>
      {!sources?.averages.length&&<Typography variant="body2" color="text.secondary">{t.emptyAverage}</Typography>}
      {sources?.averages.map(row=><Box key={row.key} sx={{p:1.5,border:1,borderColor:'divider',borderRadius:1}}><Typography variant="body2">{label(row.code)} · {row.partner} · {label(row.unit)} · {row.currency}</Typography><Typography variant="caption">{t.average}: {formatCurrency(row.unitPrice,{currencyCode:row.currency,languageCode})} · {row.count} {t.count} · {decimal(row.quantity)}</Typography><Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>{[['usePoly','polyPrice'],['useBox','boxPrice'],['useOther','otherUnitCost']].map(([text,key])=><Button key={key} size="small" disabled={disabled||row.currency!==input.currency} onClick={()=>{change(key,Number(row.unitPrice.toFixed(4)));if(key==='otherUnitCost')change('costMode','estimate');}}>{t[text]}</Button>)}</Stack></Box>)}
     </Card>
    </Stack>
    <Paper variant="outlined" sx={{p:2.5,minWidth:0,position:{lg:'sticky'},top:16}}><Stack spacing={1}>
     <Typography variant="h6">{t.result}</Typography>{metric('hours',decimal(result.workloadHours))}{metric('days',decimal(result.days))}{metric('people',decimal(result.requiredWorkers))}{metric('share',result.share===null?'—':decimal(result.share*100)+'%')}
     {result.days!==null&&Number(input.targetDays)>0&&<Chip size="small" color={result.days>Number(input.targetDays)?'warning':'success'} label={result.days>Number(input.targetDays)?t.late:t.deadline}/>}
     {input.packaging&&<>{metric('bags',decimal(result.poly))}{metric('boxes',decimal(result.boxes))}</>}
     <Box sx={{borderTop:1,borderColor:'divider',pt:1}}>{Object.entries(result.costs).map(([key,value])=>metric(({production:'costProduction',direct:'costDirect'})[key]||key,money(value)))}</Box>
     {metric('revenue',money(result.revenue))}{metric('total',money(result.total))}{metric('unitCost',money(result.unitCost))}<Box sx={{borderTop:1,borderColor:'divider',pt:1,color:result.profit===null?'text.primary':result.profit<0?'error.main':'success.main'}}>{metric('profit',money(result.profit),true)}{metric('margin',result.margin===null?'—':decimal(result.margin)+'%')}</Box>
     {!result.ready&&<Alert severity="warning"><Typography variant="body2">{t.partial}</Typography><Typography variant="body2">{t.missing}: {result.missing.map(key=>t[key]||key).join(' · ')}</Typography></Alert>}{!result.ready&&metric('knownCost',money(result.knownCost))}
    </Stack></Paper>
   </Box>
   <Card title={t.costTable}>{!sources?.costs.length?<Typography color="text.secondary">{t.emptyCosts}</Typography>:<TableContainer><Table size="small" sx={{minWidth:850}}><TableHead><TableRow>{['date','reference','description','vendor','quantity','amount','status','source'].map(key=><TableCell key={key}>{t[key]}</TableCell>)}</TableRow></TableHead><TableBody>{sources.costs.map(row=><TableRow key={row.id}><TableCell>{row.date}</TableCell><TableCell>{row.reference}</TableCell><TableCell>{label(row.code)||row.description}</TableCell><TableCell>{row.partner}</TableCell><TableCell>{row.quantity} {label(row.unit)}</TableCell><TableCell>{formatCurrency(row.subtotal??row.amount,{currencyCode:row.currency,languageCode})} / {row.currency}</TableCell><TableCell>{!row.exact?t.unallocated:!row.approved?t.pending:row.subtotal===null?t.missingSubtotal:t.approved}</TableCell><TableCell>{row.requestId&&<Button onClick={()=>navigateToPath(`/outsourcing-record/edit/request/${row.requestId}`)}>{t.source}</Button>}</TableCell></TableRow>)}</TableBody></Table></TableContainer>}</Card>
  </PageContentStack>
 </AppPageContainer>;
}
