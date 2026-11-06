import SelectionSummaryRow from '../../components/SelectionSummaryRow';
import {internalFundsText} from '../../constants/internalFunds';
import {accountingDirectionText} from '../../constants/accountingDirection';
import React,{useCallback,useEffect,useState} from 'react';
import {Alert,Box,Button,Checkbox,Chip,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,IconButton,MenuItem,Slide,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Tooltip,Typography,useMediaQuery} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined';
import AccountingSubtypePanel,{SUBTYPE_PICKER_TEXT} from '../../components/AccountingSubtypePanel';
import AppPageContainer from '../../components/AppPageContainer';
import PageContentStack from '../../components/PageContentStack';
import HierarchyPanel from '../../components/HierarchyPanel';
import AccountingInputPanel from '../../components/AccountingInputPanel';
import {EXPENSE_TEXT} from '../../constants/expenseTypes';
import LocalizedNameFields from '../../components/LocalizedNameFields';
import SettingDeleteButton from '../../components/SettingDeleteButton';
import SaveButton from '../../components/SaveButton';
import {hasLocalizedName} from '../../utils/localizedName.mjs';
import {classificationName} from '../../utils/partnerClassification.mjs';
import {useLanguage} from '../../context/LanguageContext';
import {requestJSON} from '../../utils/apiClient';
import {subscribeWorkspaceDataChanged} from '../../utils/workspaceDataEvents';
import {TRANSACTION_CLASSIFICATION_FLOW} from '../../constants/industryHierarchy';

const TEXT={
 ko:{title:'회계 코드 관리',all:'전체 코드',category:'구분 · 세부 업종',industry:'세부 업종',add:'기본 코드 등록',code:'기본 코드',name:'거래 내용',active:'사용 설정',edit:'수정',save:'저장',cancel:'취소',empty:'등록된 기본 코드가 없습니다.',error:'설정을 불러오거나 저장하지 못했습니다.',conflict:'같은 기본 코드 또는 변경할 회사별 코드가 이미 있습니다. 다른 코드를 입력해 주세요.',stale:'연결 세부 업종이 변경되었습니다. 다시 조회한 후 저장하세요.',mode:'입력 방식',PROCESS:'생산 실적 연결',LOGISTICS:'운송 비용',GENERAL:'일반 비용'},
 en:{title:'Accounting codes',all:'All codes',category:'Categories > Industries',industry:'Industry',add:'Add base code',code:'Base code',name:'Description',active:'Enabled',edit:'Edit',save:'Save',cancel:'Cancel',empty:'No base codes registered.',error:'Could not load or save settings.',conflict:'The base code or a resulting company code already exists. Enter a different code.',stale:'Linked industries changed. Reload before saving.',mode:'Input method',PROCESS:'Production record',LOGISTICS:'Transport cost',GENERAL:'General cost'},
 vi:{title:'Mã kế toán',all:'Tất cả mã',category:'Nhóm > ngành nghề',industry:'Ngành nghề',add:'Thêm mã gốc',code:'Mã gốc',name:'Nội dung',active:'Cho phép sử dụng',edit:'Sửa',save:'Lưu',cancel:'Hủy',empty:'Chưa có mã gốc.',error:'Không thể tải hoặc lưu cài đặt.',conflict:'Mã gốc hoặc mã công ty sau khi đổi đã tồn tại. Vui lòng nhập mã khác.',stale:'Ngành nghề liên kết đã thay đổi. Tải lại trước khi lưu.',mode:'Cách nhập',PROCESS:'Sản lượng gia công',LOGISTICS:'Chi phí vận chuyển',GENERAL:'Chi phí chung'},
};
const path='/system-setting-defaults/code-bases';
export default function AccountingCodeSettings(){
 const {languageCode}=useLanguage(),text=TEXT[languageCode]||TEXT.en,name=row=>classificationName(row,languageCode);
 const directionText=accountingDirectionText[languageCode]||accountingDirectionText.en;
 const inputsText=EXPENSE_TEXT[languageCode]||EXPENSE_TEXT.en;
 const [panelKind,setPanelKind]=useState('SUBTYPE');
 const subtypePicker=SUBTYPE_PICKER_TEXT[languageCode]||SUBTYPE_PICKER_TEXT.en;
 const [rows,setRows]=useState([]),[industries,setIndustries]=useState([]),[roles,setRoles]=useState([]),[selected,setSelected]=useState('ALL');
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[form,setForm]=useState(null);
 const [pickerOpen,setPickerOpen]=useState(false),[pickerExiting,setPickerExiting]=useState(false);
 const reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)'),panelDuration=reducedMotion?0:240,showPicker=pickerOpen||pickerExiting;
 useEffect(()=>{if(!form){setPickerOpen(false);setPickerExiting(false);}},[form]);
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{const [bases,sources,parents]=await Promise.all([requestJSON(path,{skipCache:true}),requestJSON('/system-setting-defaults/services',{skipCache:true}),requestJSON('/system-setting-defaults/partner-roles',{skipCache:true})]);setRows(bases);setIndustries(sources);setRoles(parents);}
  catch{setError(text.error);}finally{setLoading(false);}
 },[text.error]);
 useEffect(()=>{load();},[load]);
 useEffect(()=>{const unsubscribe=subscribeWorkspaceDataChanged(detail=>{if(detail?.source==='transaction-request')load();});window.addEventListener('focus',load);return()=>{unsubscribe();window.removeEventListener('focus',load);};},[load]);
 const linkedIds=row=>row.industryIds||[];
 const inIndustry=(row,id)=>linkedIds(row).includes(id);
 const inRole=(row,id)=>industries.some(industry=>industry.partnerRoleId===id&&inIndustry(row,industry.id));
 const sourceRows=industries.filter(row=>row.code!=='GENERAL'&&(row.isActive||rows.some(base=>inIndustry(base,row.id))));
 const items=[{id:'ALL',label:text.all,count:rows.length},...roles.flatMap(role=>[
  {id:'role:'+role.id,label:name(role),count:rows.filter(row=>inRole(row,role.id)).length},
  ...sourceRows.filter(row=>row.partnerRoleId===role.id).map(industry=>({id:'industry:'+industry.id,label:name(industry),depth:1,count:rows.filter(row=>inIndustry(row,industry.id)).length})),
 ])];
 const [kind,idText]=selected.split(':'),selectedId=Number(idText);
 const fundsIndustry=sourceRows.find(row=>row.code==='FUNDS');
 const fundsSelected=fundsIndustry&&(kind==='industry'?selectedId===fundsIndustry.id:kind==='role'&&selectedId===fundsIndustry.partnerRoleId);
 useEffect(()=>{if(!loading&&!items.some(item=>item.id===selected))setSelected('ALL');},[loading,roles,industries,selected]);
 const visible=selected==='ALL'?rows:rows.filter(row=>kind==='role'?inRole(row,selectedId):inIndustry(row,selectedId));
 const openCreate=()=>{
  const initial=kind==='industry'?sourceRows.find(row=>row.id===selectedId):null;
  setForm({cashDirection:'BOTH',code:'',nameKo:'',nameEn:'',nameVi:'',industryIds:initial?[initial.id]:[],entryMode:'GENERAL',requiredFields:[],orderInput:'HIDDEN',styleInput:'HIDDEN',processInput:'HIDDEN',isActive:true});
 };
 const togglePanel=kind=>{if(pickerOpen&&panelKind===kind){closePicker();return;}setPanelKind(kind);setPickerExiting(false);setPickerOpen(true);};
 const activeInputs=form?['order','style','process','transportDate','origin','destination'].filter(key=>['order','style','process'].includes(key)?form[key+'Input']&&form[key+'Input']!=='HIDDEN':form.requiredFields?.includes(key)):[];
 const closePicker=()=>{setPickerExiting(true);setPickerOpen(false);};
 const save=async()=>{
  setSaving(true);setError('');
  try{
   const {expenseTypeId,expenseType,industryLinks,industries:oldIndustries,variants,...body}=form;
   await requestJSON(path+(form.id?'/'+form.id:''),{method:form.id?'PUT':'POST',body:JSON.stringify({...body,taxTreatmentIds:[1,2,3]})});setForm(null);await load();
  }catch(failure){setError(failure?.message==='CODE_RENAME_CONFLICT'?text.conflict:failure?.message==='ACCOUNTING_INDUSTRY_CHANGED'?text.stale:text.error);}finally{setSaving(false);}
 };
 const options=sourceRows.filter(row=>row.isActive||form?.industryIds.includes(row.id)).sort((a,b)=>(roles.findIndex(row=>row.id===a.partnerRoleId)-roles.findIndex(row=>row.id===b.partnerRoleId))||a.id-b.id);
 return <AppPageContainer title={text.title} titleActions={<Button variant="contained" disabled={loading||saving} onClick={openCreate}>{text.add}</Button>}>
  <PageContentStack><Typography variant="body2" color="text.secondary">{TRANSACTION_CLASSIFICATION_FLOW[languageCode]||TRANSACTION_CLASSIFICATION_FLOW.en}</Typography>{error&&<Alert severity="error">{error}</Alert>}
   <HierarchyPanel label={text.category} items={items} selectedId={selected} onSelect={setSelected}>
    <Stack direction="row" alignItems="baseline" useFlexGap flexWrap="wrap" gap={1.5} sx={{mb:2}}><Typography variant="subtitle2">{items.find(item=>item.id===selected)?.label||text.all}</Typography>{fundsSelected&&<Typography variant="caption" color="text.secondary">{internalFundsText[languageCode]||internalFundsText.en}</Typography>}</Stack>
    <TableContainer><Table size="small"><TableHead><TableRow>{[text.code,text.name,text.industry,directionText.label,text.active,''].map((label,index)=><TableCell key={index}>{label}</TableCell>)}</TableRow></TableHead>
     <TableBody>{visible.map(row=><TableRow key={row.id}>
      <TableCell><Typography fontWeight={700}>{row.code}</Typography></TableCell><TableCell>{name(row)}</TableCell>
      <TableCell>{(row.industries||[]).map(industry=>[name(industry.partnerRole),name(industry)].filter(Boolean).join(' > ')).join(', ')||'—'}</TableCell>
      <TableCell>{directionText[row.cashDirection||'BOTH']}</TableCell><TableCell>{(row.isAvailable??row.isActive)?'✓':'—'}</TableCell><TableCell><Stack direction="row">
       <IconButton aria-label={text.edit} color="primary" size="small" disabled={loading||saving} onClick={()=>setForm({...row,isActive:row.isAvailable??row.isActive,industryIds:linkedIds(row)})}><EditIcon fontSize="small"/></IconButton>
       <SettingDeleteButton path={path} id={row.id} name={row.code} used={row.hasUsageHistory} disabled={loading||saving} languageCode={languageCode} onDeleted={load} onError={async message=>{await load();setError(message);}}/>
      </Stack></TableCell></TableRow>)}{!loading&&!visible.length&&<TableRow><TableCell colSpan={6}>{text.empty}</TableCell></TableRow>}</TableBody>
    </Table></TableContainer>
   </HierarchyPanel>
  </PageContentStack>
  <Dialog open={Boolean(form)} onClose={()=>!saving&&setForm(null)} fullWidth maxWidth={pickerOpen?'xl':'md'} slotProps={{paper:{sx:{maxHeight:'calc(100dvh - 48px)',transition:theme=>theme.transitions.create('max-width',{duration:panelDuration,easing:theme.transitions.easing.easeInOut})}}}}>
   <DialogTitle>{form?.id?text.edit:text.add}</DialogTitle>
   <DialogContent dividers>{form&&<Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',md:pickerOpen?'minmax(0,1fr) 380px':'minmax(0,1fr) 0px'},columnGap:{xs:0,md:pickerOpen?2.5:0},rowGap:2.5,alignItems:'start',overflowX:'clip',transition:theme=>theme.transitions.create(['grid-template-columns','column-gap'],{duration:panelDuration,easing:theme.transitions.easing.easeInOut})}}>{error&&<Alert severity="error" sx={{gridColumn:'1 / -1'}}>{error}</Alert>}<Stack spacing={2.5} sx={{py:1,minWidth:0,display:{xs:showPicker?'none':'flex',md:'flex'}}}>
    <Box sx={{display:'flex',justifyContent:'space-between',gap:2}}><TextField required label={text.code} sx={{width:180}} value={form.code} disabled={saving} onChange={event=>setForm({...form,code:event.target.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,3)})}/><FormControlLabel label={text.active} control={<Checkbox checked={form.isActive} disabled={saving||form.legacyUsageDisabled} onChange={event=>setForm({...form,isActive:event.target.checked})}/>}/></Box>
    {form.legacyUsageDisabled&&<Typography variant="caption" color="text.secondary">{languageCode==='ko'?'기존 사용 중지 설정 유지':languageCode==='vi'?'Giữ cài đặt ngừng sử dụng hiện có':'Existing disabled setting preserved'}</Typography>}
    <LocalizedNameFields value={form} languageCode={languageCode} disabled={saving} onChange={(key,value)=>setForm(current=>({...current,[key]:value}))}/>
    <TextField select id="accounting-cash-direction" fullWidth size="small" label={directionText.label} value={form.cashDirection||'BOTH'} disabled={saving} helperText={directionText.hint} onChange={event=>setForm(current=>({...current,cashDirection:event.target.value}))}>{['IN','OUT','BOTH'].map(value=><MenuItem key={value} value={value}>{directionText[value]}</MenuItem>)}</TextField>
    <SelectionSummaryRow data-accounting-summary="subtypes" title={text.industry+((!form.id||form.isActive)?' *':'')} action={<Button id="accounting-subtype-toggle" size="small" startIcon={<ViewSidebarOutlinedIcon/>} disabled={saving} aria-label={subtypePicker.title} aria-expanded={pickerOpen&&panelKind==='SUBTYPE'} aria-controls={pickerOpen&&panelKind==='SUBTYPE'?'accounting-subtype-panel':undefined} onClick={()=>togglePanel('SUBTYPE')}>{subtypePicker.select}</Button>}>{options.filter(row=>form.industryIds.includes(row.id)).map(row=><Tooltip key={row.id} title={name(roles.find(role=>role.id===row.partnerRoleId))}><Chip size="small" label={name(row)} disabled={saving} sx={{maxWidth:'100%',height:28,borderRadius:1}} onDelete={()=>setForm(current=>({...current,industryIds:current.industryIds.filter(id=>id!==row.id)}))}/></Tooltip>)}{!form.industryIds.length&&<Typography variant="body2" color="text.secondary">&mdash;</Typography>}</SelectionSummaryRow>
    <SelectionSummaryRow data-accounting-summary="inputs" title={inputsText.inputs} action={<Button id="accounting-input-toggle" size="small" startIcon={<ViewSidebarOutlinedIcon/>} disabled={saving} aria-label={inputsText.inputs} aria-expanded={pickerOpen&&panelKind==='INPUT'} aria-controls={pickerOpen&&panelKind==='INPUT'?'accounting-input-panel':undefined} onClick={()=>togglePanel('INPUT')}>{text.edit}</Button>}>{activeInputs.map(key=><Chip key={key} size="small" variant="outlined" sx={{height:28,borderRadius:1}} label={inputsText[key].replace(/ \uC785\uB825$| input$|^Nh\u1EADp /g,'')+' \u00b7 '+inputsText[['order','style','process'].includes(key)?form[key+'Input']:'REQUIRED']}/>)}{!activeInputs.length&&<Typography variant="body2" color="text.secondary">{inputsText.HIDDEN}</Typography>}</SelectionSummaryRow>
   </Stack><Slide direction="left" in={pickerOpen} timeout={panelDuration} mountOnEnter unmountOnExit onExited={()=>{setPickerExiting(false);document.getElementById(panelKind==='SUBTYPE'?'accounting-subtype-toggle':'accounting-input-toggle')?.focus();}}><Box sx={{position:{md:'sticky'},top:0,minWidth:0,width:'100%',overflow:'hidden'}}>{panelKind==='INPUT'?<AccountingInputPanel value={form} onChange={setForm} onClose={closePicker} disabled={saving} languageCode={languageCode}/>:<AccountingSubtypePanel options={options} roles={roles} value={form.industryIds} onChange={industryIds=>setForm(current=>({...current,industryIds}))} onClose={closePicker} disabled={saving} languageCode={languageCode}/>}</Box></Slide></Box>}</DialogContent>
   <DialogActions sx={{px:3,py:2}}><Button disabled={saving} onClick={()=>setForm(null)}>{text.cancel}</Button><SaveButton loading={saving} onClick={save} disabled={saving||!form||!/^[A-Z]{3}$/.test(form.code)||(!form.industryIds.length&&(!form.id||form.isActive))||!hasLocalizedName(form)}>{text.save}</SaveButton></DialogActions>
  </Dialog>
 </AppPageContainer>;
}
