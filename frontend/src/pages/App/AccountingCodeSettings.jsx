import React,{useCallback,useEffect,useState} from 'react';
import {Alert,Autocomplete,Box,Button,Checkbox,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,IconButton,MenuItem,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography,createFilterOptions} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import AppPageContainer from '../../components/AppPageContainer';
import PageContentStack from '../../components/PageContentStack';
import HierarchyPanel from '../../components/HierarchyPanel';
import AccountingInputSettings from '../../components/AccountingInputSettings';
import LocalizedNameFields from '../../components/LocalizedNameFields';
import SettingDeleteButton from '../../components/SettingDeleteButton';
import SaveButton from '../../components/SaveButton';
import {hasLocalizedName} from '../../utils/localizedName.mjs';
import {classificationName} from '../../utils/partnerClassification.mjs';
import {useLanguage} from '../../context/LanguageContext';
import {requestJSON} from '../../utils/apiClient';
import {subscribeWorkspaceDataChanged} from '../../utils/workspaceDataEvents';

const TEXT={
 ko:{title:'회계 코드 관리',all:'전체 코드',category:'거래처 구분 · 세부 업종',industry:'세부 업종',add:'기본 코드 등록',code:'기본 코드',name:'거래 내용',active:'사용 설정',edit:'수정',save:'저장',cancel:'취소',empty:'등록된 기본 코드가 없습니다.',error:'설정을 불러오거나 저장하지 못했습니다.',conflict:'같은 기본 코드 또는 변경할 회사별 코드가 이미 있습니다. 다른 코드를 입력해 주세요.',stale:'연결 업종이 변경되었습니다. 다시 조회한 후 저장하세요.',mode:'입력 방식',PROCESS:'생산 실적 연결',LOGISTICS:'운송 비용',GENERAL:'일반 비용'},
 en:{title:'Accounting codes',all:'All codes',category:'Partner categories · industries',industry:'Industry',add:'Add base code',code:'Base code',name:'Description',active:'Enabled',edit:'Edit',save:'Save',cancel:'Cancel',empty:'No base codes registered.',error:'Could not load or save settings.',conflict:'The base code or a resulting company code already exists. Enter a different code.',stale:'Linked industries changed. Reload before saving.',mode:'Input method',PROCESS:'Production record',LOGISTICS:'Transport cost',GENERAL:'General cost'},
 vi:{title:'Mã kế toán',all:'Tất cả mã',category:'Nhóm đối tác · ngành',industry:'Ngành chi tiết',add:'Thêm mã gốc',code:'Mã gốc',name:'Nội dung',active:'Cho phép sử dụng',edit:'Sửa',save:'Lưu',cancel:'Hủy',empty:'Chưa có mã gốc.',error:'Không thể tải hoặc lưu cài đặt.',conflict:'Mã gốc hoặc mã công ty sau khi đổi đã tồn tại. Vui lòng nhập mã khác.',stale:'Ngành liên kết đã thay đổi. Tải lại trước khi lưu.',mode:'Cách nhập',PROCESS:'Sản lượng gia công',LOGISTICS:'Chi phí vận chuyển',GENERAL:'Chi phí chung'},
};
const path='/system-setting-defaults/code-bases';
export default function AccountingCodeSettings(){
 const {languageCode}=useLanguage(),text=TEXT[languageCode]||TEXT.en,name=row=>classificationName(row,languageCode);
 const [rows,setRows]=useState([]),[industries,setIndustries]=useState([]),[roles,setRoles]=useState([]),[selected,setSelected]=useState('ALL');
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[form,setForm]=useState(null);
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
 const visible=selected==='ALL'?rows:rows.filter(row=>kind==='role'?inRole(row,selectedId):inIndustry(row,selectedId));
 const openCreate=()=>{
  const initial=kind==='industry'?sourceRows.find(row=>row.id===selectedId):null;
  setForm({code:'',nameKo:'',nameEn:'',nameVi:'',industryIds:initial?[initial.id]:[],entryMode:initial?.entryMode||'GENERAL',requiredFields:[],orderInput:'OPTIONAL',styleInput:'HIDDEN',processInput:'HIDDEN',isActive:true});
 };
 const save=async()=>{
  setSaving(true);setError('');
  try{
   const {expenseTypeId,expenseType,industryLinks,industries:oldIndustries,variants,...body}=form;
   await requestJSON(path+(form.id?'/'+form.id:''),{method:form.id?'PUT':'POST',body:JSON.stringify({...body,taxTreatmentIds:[1,2,3]})});setForm(null);await load();
  }catch(failure){setError(failure?.message==='CODE_RENAME_CONFLICT'?text.conflict:failure?.message==='ACCOUNTING_INDUSTRY_CHANGED'?text.stale:text.error);}finally{setSaving(false);}
 };
 const options=sourceRows.filter(row=>row.isActive||form?.industryIds.includes(row.id)).sort((a,b)=>(roles.findIndex(row=>row.id===a.partnerRoleId)-roles.findIndex(row=>row.id===b.partnerRoleId))||a.id-b.id);
 return <AppPageContainer title={text.title} titleActions={<Button variant="contained" disabled={loading||saving} onClick={openCreate}>{text.add}</Button>}>
  <PageContentStack>{error&&<Alert severity="error">{error}</Alert>}
   <HierarchyPanel label={text.category} items={items} selectedId={selected} onSelect={setSelected}>
    <Typography variant="subtitle2" sx={{mb:2}}>{items.find(item=>item.id===selected)?.label||text.all}</Typography>
    <TableContainer><Table size="small"><TableHead><TableRow>{[text.code,text.name,text.industry,text.active,''].map((label,index)=><TableCell key={index}>{label}</TableCell>)}</TableRow></TableHead>
     <TableBody>{visible.map(row=><TableRow key={row.id}>
      <TableCell><Typography fontWeight={700}>{row.code}</Typography></TableCell><TableCell>{name(row)}</TableCell>
      <TableCell>{(row.industries||[]).map(industry=>[name(industry.partnerRole),name(industry)].filter(Boolean).join(' > ')).join(', ')||'—'}</TableCell>
      <TableCell>{(row.isAvailable??row.isActive)?'✓':'—'}</TableCell><TableCell><Stack direction="row">
       <IconButton aria-label={text.edit} color="primary" size="small" disabled={loading||saving} onClick={()=>setForm({...row,isActive:row.isAvailable??row.isActive,industryIds:linkedIds(row)})}><EditIcon fontSize="small"/></IconButton>
       <SettingDeleteButton path={path} id={row.id} name={row.code} used={row.hasUsageHistory} disabled={loading||saving} languageCode={languageCode} onDeleted={load} onError={async message=>{await load();setError(message);}}/>
      </Stack></TableCell></TableRow>)}{!loading&&!visible.length&&<TableRow><TableCell colSpan={5}>{text.empty}</TableCell></TableRow>}</TableBody>
    </Table></TableContainer>
   </HierarchyPanel>
  </PageContentStack>
  <Dialog open={Boolean(form)} onClose={()=>!saving&&setForm(null)} fullWidth maxWidth="md" slotProps={{paper:{sx:{maxHeight:'calc(100dvh - 48px)'}}}}>
   <DialogTitle>{form?.id?text.edit:text.add}</DialogTitle>
   <DialogContent dividers>{form&&<Stack spacing={2.5} sx={{py:1}}>
    {error&&<Alert severity="error">{error}</Alert>}
    <Box sx={{display:'flex',justifyContent:'space-between',gap:2}}><TextField required label={text.code} sx={{width:180}} value={form.code} disabled={saving} onChange={event=>setForm({...form,code:event.target.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,3)})}/><FormControlLabel label={text.active} control={<Checkbox checked={form.isActive} disabled={saving||form.legacyUsageDisabled} onChange={event=>setForm({...form,isActive:event.target.checked})}/>}/></Box>
    {form.legacyUsageDisabled&&<Typography variant="caption" color="text.secondary">{languageCode==='ko'?'기존 사용 중지 설정 유지':languageCode==='vi'?'Giữ cài đặt ngừng sử dụng hiện có':'Existing disabled setting preserved'}</Typography>}
    <LocalizedNameFields value={form} languageCode={languageCode} disabled={saving} onChange={(key,value)=>setForm(current=>({...current,[key]:value}))}/>
    <Autocomplete multiple disableCloseOnSelect options={options} value={options.filter(row=>form.industryIds.includes(row.id))} disabled={saving} groupBy={row=>name(roles.find(role=>role.id===row.partnerRoleId))} getOptionLabel={name} isOptionEqualToValue={(row,value)=>row.id===value.id}
     filterOptions={createFilterOptions({stringify:row=>[row.code,row.nameKo,row.nameEn,row.nameVi,name(row.partnerRole)].join(' ')})}
     onChange={(_,selection)=>setForm({...form,industryIds:selection.map(row=>row.id),...(!form.id&&!form.industryIds.length&&selection.length?{entryMode:selection[0].entryMode}:{})})}
     renderOption={(props,row,{selected})=>{const {key,...rest}=props;return <li key={key} {...rest}><Checkbox checked={selected}/>{name(row)}</li>;}}
     renderInput={params=><TextField {...params} required={!form.id||form.isActive} label={text.industry}/>}/>
    <TextField select label={text.mode} value={form.entryMode} disabled={saving||form.hasUsageHistory} onChange={event=>setForm({...form,entryMode:event.target.value})}>{[...new Set(['GENERAL','LOGISTICS','PROCESS',form.entryMode])].filter(Boolean).map(mode=><MenuItem key={mode} value={mode}>{text[mode]||mode}</MenuItem>)}</TextField>
    <AccountingInputSettings value={form} onChange={setForm} languageCode={languageCode} disabled={saving}/>
   </Stack>}</DialogContent>
   <DialogActions sx={{px:3,py:2}}><Button disabled={saving} onClick={()=>setForm(null)}>{text.cancel}</Button><SaveButton loading={saving} onClick={save} disabled={saving||!form||!/^[A-Z]{3}$/.test(form.code)||(!form.industryIds.length&&(!form.id||form.isActive))||!hasLocalizedName(form)}>{text.save}</SaveButton></DialogActions>
  </Dialog>
 </AppPageContainer>;
}
