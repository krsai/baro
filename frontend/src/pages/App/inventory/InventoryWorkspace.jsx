import {materialItemText} from '../../../constants/materialItems';
import {inventoryApprovalText} from '../../../constants/inventoryApproval';
import {InventoryEntry,InventoryRows} from './InventoryMovements';
import MaterialMasterList from '../../../components/MaterialMasterList';
import SearchPanel from '../../../components/SearchPanel';
import React, { useEffect,useState } from 'react';
import { useLocation,useNavigate } from 'react-router-dom';
import {Button,Paper,Stack,Tab,Table,TableBody,TableCell,TableHead,TableRow,Tabs} from '@mui/material';
import {useLanguage} from '../../../context/LanguageContext';
import {useAuth} from '../../../context/AuthContext';
import {canAccessPath} from '../../../utils/accessControl';
import Alert from "../../../components/AppNotice";
import AddIcon from '@mui/icons-material/Add';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchInput from '../../../components/SearchInput';

const SETTINGS = {
  types: [
    ['FABRIC', '겉감', 'M', '규격 · 색상'],
    ['SNAP', '일반 스냅', 'EA', '규격 · 타입 · 색상'],
    ['POLYBAG', '폴리백', 'EA', '규격'],
  ],
  units: [
    ['EA', '개', '0', '정수'],
    ['M', '미터', '2', '소수 허용'],
    ['KG', '킬로그램', '3', '소수 허용'],
    ['BOX', '박스', '0', '정수'],
  ],
  specs: [
    ['13MM', '13mm', '일반 스냅', '규격'],
    ['58IN', '58 inch', '겉감', '규격'],
    ['B', 'B', '일반 스냅', '타입'],
  ],
};

const PAGE_META = {
  stock: ['자재 현황', '창고·소유자·자재별 현재고와 가용재고를 조회합니다.'],
  entry: ['입출고 등록', '구매·입고·출고·이동·반환·손실·조정 거래를 등록합니다.'],
  history: ['입출고', '모든 재고 증감과 정정 이력을 조회하고 신규 거래를 등록합니다.'],
  materials: ['자재 마스터', '실제 입출고와 BOM에서 사용할 정확한 자재 품목을 관리합니다.'],
  settings: ['자재 마스터', '자재 종류·단위·규격·타입 마스터를 관리합니다.'],
};

const UiNotice = () => (
  <Alert severity="info" variant="outlined">
    현재는 메뉴와 화면 구성 시안입니다. 입력값은 서버에 저장되지 않습니다.
  </Alert>
);

const SettingsView = () => {
  const [tab, setTab] = useState('types');
  const labels = { types: ['코드','자재 종류','기본 단위','사용 속성'], units: ['코드','표시명','소수 자릿수','수량 방식'], specs: ['코드','표시값','자재 종류','타입'] };
  return <Stack spacing={2}><UiNotice /><Paper variant="outlined"><Tabs value={tab} onChange={(_event, value) => setTab(value)} variant="scrollable"><Tab value="types" label="자재 종류" /><Tab value="units" label="단위" /><Tab value="specs" label="규격·타입" /><Tab value="colors" label="색상 연결" /></Tabs></Paper>{tab === 'colors' ? <Alert severity="info">색상은 기존 공용 색상 마스터를 사용합니다. 이 화면에서는 자재 등록에 사용할 색상을 연결합니다.</Alert> : <Paper variant="outlined"><Table size="small"><TableHead><TableRow>{labels[tab].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{SETTINGS[tab].map((row) => <TableRow hover key={row.join('-')}>{row.map((value) => <TableCell key={value}>{value}</TableCell>)}</TableRow>)}</TableBody></Table></Paper>}</Stack>;
};

const InventoryWorkspace = ({ view = 'stock' }) => {
  const navigate = useNavigate(),location=useLocation();
  const [entryOpen,setEntryOpen]=useState(()=>new URLSearchParams(location.search).get('register')==='1');
  useEffect(()=>{if(new URLSearchParams(location.search).get('register')==='1')setEntryOpen(true);},[location.search]);
  const auth=useAuth(),{languageCode}=useLanguage();
  const movementText=inventoryApprovalText[languageCode]||inventoryApprovalText.en;
  const canViewMaterials=canAccessPath('/inventory/materials',auth),canViewReference=canAccessPath('/inventory/settings',auth);
  const mergedMaterials=['materials','settings'].includes(view);
  const sections=({ko:{materials:'자재 마스터',reference:'기준정보'},en:{materials:'Material master',reference:'Reference data'},vi:{materials:'Danh mục vật tư',reference:'Dữ liệu chuẩn'}})[languageCode]||{materials:'Material master',reference:'Reference data'};
  const [title] = PAGE_META[view] || PAGE_META.stock;
  const [keyword, setKeyword] = useState('');
  const [searchResetVersion, setSearchResetVersion] = useState(0);
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);
  const resetSearch = () => { setKeyword(''); setSearchResetVersion(value => value + 1); };
  const titleActions = view === 'history' ? (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEntryOpen(true)}>{movementText.register}</Button>
  ) : view==='materials' && canViewMaterials ? (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setMaterialDialogOpen(true)}>{(materialItemText[languageCode]||materialItemText.en).add}</Button>
  ) : null;
  const toolbar = view==='stock'||view==='history'||view==='materials'&&canViewMaterials ? (
    <SearchPanel key={searchResetVersion} onReset={resetSearch} search={<SearchInput value={keyword} onChange={event=>setKeyword(event.target.value)}/>} />
  ) : null;
  const content = mergedMaterials ? (view==='materials' ? canViewMaterials?<MaterialMasterList keyword={keyword} open={materialDialogOpen} onClose={()=>setMaterialDialogOpen(false)}/>:null : canViewReference?<SettingsView/>:null) : view==='entry' ? <InventoryEntry/> : <InventoryRows key={auth.activeOrgId} view={view} keyword={keyword}/>;
  return (
    <>
      <AppPageContainer
        title={mergedMaterials?sections.materials:view==='history'?movementText.title:title}
        titleActions={titleActions}
        toolbar={toolbar}
      >
        {content}
      </AppPageContainer>
      {entryOpen&&<InventoryEntry onClose={()=>{setEntryOpen(false);if(location.search)navigate(location.pathname,{replace:true});}} onSaved={()=>{setEntryOpen(false);if(location.search)navigate(location.pathname,{replace:true});}}/>}

    </>
  );
};

export default InventoryWorkspace;
