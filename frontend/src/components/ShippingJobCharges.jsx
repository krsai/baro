import React,{useEffect,useRef,useState} from 'react';
import {Box,Button,Stack,Tab,Tabs,TextField,MenuItem,Typography} from '@mui/material';
import ListDetailDialog from './ListDetailDialog';
import DialogRecordList from './DialogRecordList';
import DialogDetailPanel from './DialogDetailPanel';
import DialogRecordActions from './DialogRecordActions';
import PageActions from './PageActions';
import AppNotice from './AppNotice';
import SearchableSelect from './SearchableSelect';
import ReadOnlyField from './ReadOnlyField';
import {usePageDialogs} from './PageDialogProvider';
import {useAppActions} from '../context/AppContext';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {shippingChargeAmount,formatShippingCharge} from '../utils/shippingChargeTotals.mjs';
import {useAuth} from '../context/AuthContext';
import {canAccessPath} from '../utils/accessControl';

export const shippingJobChargeText={
 ko:{ar:'AR 입력 · 청구',ap:'AP 입력 · 비용신청',add:'항목 추가',target:'대상 운송',party:'거래처',description:'내역',currency:'통화',quantity:'수량',unitPrice:'단가',amount:'금액',save:'저장',retry:'같은 요청 재시도',cancel:'취소',close:'닫기',saved:'저장했습니다.',failed:'저장하거나 불러오지 못했습니다. 입력을 보존했습니다.',legacy:'기존 B/L 연결'},
 en:{ar:'AR Entry · Billing',ap:'AP Entry · Expense Request',add:'Add Item',target:'Transport Job',party:'Partner',description:'Description',currency:'Currency',quantity:'Quantity',unitPrice:'Unit Price',amount:'Amount',save:'Save',retry:'Retry Same Request',cancel:'Cancel',close:'Close',saved:'Saved.',failed:'Unable To Load Or Save. Your Input Has Been Kept.',legacy:'Existing B/L Link'},
 vi:{ar:'Nhập AR · Lập Hóa Đơn',ap:'Nhập AP · Đề Nghị Chi Phí',add:'Thêm Mục',target:'Công Việc Vận Chuyển',party:'Đối Tác',description:'Nội Dung',currency:'Tiền Tệ',quantity:'Số Lượng',unitPrice:'Đơn Giá',amount:'Số Tiền',save:'Lưu',retry:'Thử Lại Cùng Yêu Cầu',cancel:'Hủy',close:'Đóng',saved:'Đã Lưu.',failed:'Không Thể Tải Hoặc Lưu. Nội Dung Được Giữ Nguyên.',legacy:'Liên Kết B/L Hiện Có'},
};

export default function ShippingJobCharges({open,onClose,orgId,job,languageCode}){
 const t=shippingJobChargeText[languageCode]||shippingJobChargeText.en,dialogs=usePageDialogs(),auth=useAuth(),{showNotification,navigateToPath}=useAppActions();
 const [direction,setDirection]=useState('SALES'),[data,setData]=useState({rows:[],parties:[],currencies:[]}),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false),[reload,setReload]=useState(0);
 const continueLabel=({ko:{SALES:'청구서 작성',PURCHASE:'비용신청 작성'},en:{SALES:'Create Invoice',PURCHASE:'Create Expense Request'},vi:{SALES:'Lập Hóa Đơn',PURCHASE:'Lập Đề Nghị Chi Phí'}}[languageCode]||{SALES:'Create Invoice',PURCHASE:'Create Expense Request'})[direction];
 const [edit,setEdit]=useState(null),[opening,setOpening]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[saveError,setSaveError]=useState(false);
 const baseline=useRef(''),pending=useRef(null),locked=useRef(false),alive=useRef(true);
 const dirty=!!edit&&JSON.stringify(edit)!==baseline.current,blocked=busy||uncertain||opening,readOnly=job.status==='CANCELLED';
 useUnsavedChanges(dirty||busy||uncertain);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const url='/shipping-requests/'+encodeURIComponent(job.id)+'/charges'+buildQueryString({orgId});
 useEffect(()=>{if(!open)return;let live=true;setLoading(true);setLoadError(false);requestJSON(url,{skipCache:true}).then(value=>{if(live)setData(value);}).catch(()=>{if(live)setLoadError(true);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[url,reload,open]);
 const discard=async()=>!blocked&&(!dirty||await dialogs.confirm('',{purpose:'discard'}));
 const choose=async row=>{if(!await discard())return;baseline.current=JSON.stringify(row);setEdit(row);setSaveError(false);};
 const fresh=()=>({id:crypto.randomUUID(),billId:null,partyId:null,direction,sourceKind:'MANUAL',description:'',currencyCode:data.currencies[0]?.code||'',quantity:'1',unitPrice:'',amount:''});
 const changeDirection=async next=>{if(next===direction||!await discard())return;setDirection(next);setEdit(null);setSaveError(false);};
 const close=async()=>{if(await discard())onClose();};
 const patch=(key,value)=>setEdit(old=>{const next={...old,[key]:value};if(['quantity','unitPrice'].includes(key)){try{next.amount=shippingChargeAmount(next.quantity,next.unitPrice);}catch{next.amount='';}}return next;});
 const valid=!!edit?.description.trim()&&!!edit?.currencyCode&&/^\d{1,16}(?:\.\d{1,4})?$/.test(edit?.quantity||'')&&Number(edit.quantity)>0&&/^\d{1,20}(?:\.\d{1,4})?$/.test(edit?.unitPrice||'')&&/^\d{1,20}(?:\.\d{1,4})?$/.test(edit?.amount||'');
 const save=async()=>{
  if(locked.current||readOnly||edit?.billId||!edit||!uncertain&&!valid)return;locked.current=true;setBusy(true);setSaveError(false);
  pending.current=pending.current||Object.fromEntries(['id','version','direction','billId','partyId','sourceKind','description','currencyCode','quantity','unitPrice','amount'].filter(key=>edit[key]!==undefined).map(key=>[key,edit[key]]));
  try{const result=await requestJSON(url,{method:'POST',body:JSON.stringify(pending.current)}),saved={...pending.current,...result};pending.current=null;if(alive.current){setData(old=>({...old,rows:old.rows.some(row=>row.id===saved.id)?old.rows.map(row=>row.id===saved.id?saved:row):[...old.rows,saved]}));baseline.current=JSON.stringify(saved);setEdit(saved);setUncertain(false);showNotification(t.saved,'success');}}
  catch(error){if(alive.current){const unknown=!error.status||error.status>=500;if(!unknown)pending.current=null;setUncertain(unknown);setSaveError(true);}}
  finally{locked.current=false;if(alive.current)setBusy(false);}
 };
 const continueDocument=async()=>{if(blocked||dirty||!edit?.version||edit.billId)return;setOpening(true);setSaveError(false);try{const source=await requestJSON('/shipping-requests/charge-sources/'+encodeURIComponent(edit.id)+buildQueryString({orgId}),{skipCache:true});const path=source.direction==='SALES'?source.invoiceId?'/invoices/'+encodeURIComponent(source.invoiceId):source.invoiceDraftId?'/invoices/new?revision='+encodeURIComponent(source.invoiceDraftId):'/invoices/new?shippingChargeId='+encodeURIComponent(source.id):source.expenseRequestId?'/outsourcing-record/edit/request/'+source.expenseRequestId:'/outsourcing-record/new?shippingChargeId='+encodeURIComponent(source.id);onClose();navigateToPath(path);}catch{setSaveError(true);}finally{setOpening(false);}};
 const rows=data.rows.filter(row=>row.direction===direction),legacy=!!edit?.billId,linked=!!(edit?.invoiceDraftId||edit?.invoiceId||edit?.expenseRequestId),disabled=blocked||readOnly||legacy||linked;
 const numeric=(key,label)=><TextField fullWidth size="small" name={key} label={label} value={edit[key]??''} disabled={disabled} slotProps={{htmlInput:{inputMode:'decimal',maxLength:key==='quantity'?21:25}}} onChange={event=>{if(/^\d*(?:\.\d*)?$/.test(event.target.value))patch(key,event.target.value);}}/>;
 return <ListDetailDialog open={open} onClose={close} maxWidth="lg" title={'AR/AP · '+job.number} onNew={()=>choose(fresh())} newLabel={t.add} newDisabled={loading||loadError||blocked||readOnly}
  tools={<Stack spacing={2}><Tabs value={direction} onChange={(_,value)=>changeDirection(value)} aria-label="AR/AP"><Tab value="SALES" label={t.ar} disabled={blocked}/><Tab value="PURCHASE" label={t.ap} disabled={blocked}/></Tabs>{saveError&&<AppNotice severity="error">{t.failed}</AppNotice>}</Stack>}
  list={<DialogRecordList data-shipping-charges="shipment" rows={rows} selectedKey={edit?.id} onSelect={choose} previewDisabled disabled={blocked} loading={loading} error={loadError} onRetry={()=>setReload(value=>value+1)} languageCode={languageCode} columns={[{key:'description',label:t.description,value:row=>row.description},{key:'amount',label:t.amount,value:row=>formatShippingCharge(row.amount,row.currencyCode)+' '+row.currencyCode}]}/>}
  detail={edit?<DialogDetailPanel footer={<Stack spacing={1}><DialogRecordActions onSave={legacy||readOnly||linked?undefined:save} saveLabel={uncertain?t.retry:t.save} saveDisabled={!uncertain&&(!valid||!dirty&&!pending.current)} busy={busy}/>{!legacy&&!readOnly&&edit.version&&<Button variant="contained" disabled={blocked||dirty||!canAccessPath(direction==='SALES'?'/invoices/new':'/outsourcing-record/new',auth)} onClick={continueDocument}>{continueLabel}</Button>}</Stack>}>
   <Stack spacing={2} data-shipping-job-charge-editor>
    <ReadOnlyField label={t.target} value={job.number}/>{legacy&&<Typography variant="body2">{t.legacy}</Typography>}
    <SearchableSelect label={t.party} languageCode={languageCode} options={data.parties||[]} value={data.parties?.find(row=>row.id===edit.partyId)||null} disabled={disabled} getOptionLabel={row=>row[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||row.name} getLookupCode={row=>row.code} isOptionEqualToValue={(a,b)=>a.id===b.id} onChange={(_,row)=>patch('partyId',row?.id||null)}/>
    <TextField fullWidth size="small" name="description" label={t.description} value={edit.description} disabled={disabled} slotProps={{htmlInput:{maxLength:500}}} onChange={event=>patch('description',event.target.value)}/>
    <TextField fullWidth select size="small" label={t.currency} value={edit.currencyCode} disabled={disabled} onChange={event=>patch('currencyCode',event.target.value)}>{data.currencies.map(row=><MenuItem key={row.code} value={row.code}>{row.code}</MenuItem>)}</TextField>
    <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:1}}>{numeric('quantity',t.quantity)}{numeric('unitPrice',t.unitPrice)}</Box>
    <ReadOnlyField label={t.amount} value={edit.amount===''?'—':formatShippingCharge(edit.amount,edit.currencyCode)}/>
   </Stack>
  </DialogDetailPanel>:null}
  actions={<PageActions secondary={<Button disabled={blocked} onClick={close}>{t.close}</Button>}/>}
 />;
}
