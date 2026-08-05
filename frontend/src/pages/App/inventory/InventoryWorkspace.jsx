import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchInput from '../../../components/SearchInput';

const MATERIALS = [
  { code: 'MAT-000001', type: '일반 스냅', name: 'HS-SCW-90003', maker: 'YKK', spec: '13mm / B', color: 'BLACK', unit: 'EA', stock: 2800, reserved: 600 },
  { code: 'MAT-000002', type: '폴리백', name: 'OPP 접착식', maker: '-', spec: '30×40cm', color: '-', unit: 'EA', stock: 12500, reserved: 3000 },
  { code: 'MAT-000003', type: '겉감', name: 'N66 TASLAN', maker: 'HANIL', spec: '58 inch', color: 'NAVY', unit: 'M', stock: 842.5, reserved: 310 },
];

const MOVEMENTS = [
  { date: '2026-08-04', type: '구매', doc: 'IN-20260804-001', material: 'HS-SCW-90003 / BLACK', quantity: '+3,000 EA', from: '-', to: '기본 창고', owner: 'BARO', status: '확정' },
  { date: '2026-08-04', type: '생산 투입', doc: 'OUT-20260804-003', material: 'N66 TASLAN / NAVY', quantity: '-120 M', from: '기본 창고', to: '-', owner: 'BARO', status: '확정' },
  { date: '2026-08-03', type: '고객 지급 입고', doc: 'IN-20260803-002', material: '브랜드 라벨 / WHITE', quantity: '+5,000 EA', from: '-', to: '기본 창고', owner: '고객 A', status: '확정' },
];

const SETTINGS = {
  types: [
    ['FABRIC', '겉감', 'M', '규격 · 색상'],
    ['SNAP', '일반 스냅', 'EA', '규격 · 세부 구분 · 색상'],
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
    ['B', 'B', '일반 스냅', '세부 구분'],
  ],
};

const PAGE_META = {
  stock: ['재고 현황', '창고·소유자·자재별 현재고와 가용재고를 조회합니다.'],
  entry: ['거래 등록', '구매·입고·출고·이동·반환·손실·조정 거래를 등록합니다.'],
  history: ['재고 거래', '모든 재고 증감과 정정 이력을 조회하고 신규 거래를 등록합니다.'],
  materials: ['자재 관리', '실제 입출고와 BOM에서 사용할 정확한 자재 품목을 관리합니다.'],
  settings: ['자재 설정', '자재 종류·단위·규격·세부 구분 마스터를 관리합니다.'],
};

const UiNotice = () => (
  <Alert severity="info" variant="outlined">
    현재는 메뉴와 화면 구성 시안입니다. 입력값은 서버에 저장되지 않습니다.
  </Alert>
);

const EmptyAction = ({ children }) => (
  <Button variant="contained" startIcon={<SaveIcon />} onClick={() => {}}>{children}</Button>
);

const StockView = () => {
  const [keyword, setKeyword] = useState('');
  const rows = useMemo(() => MATERIALS.filter((item) => Object.values(item).join(' ').toLowerCase().includes(keyword.toLowerCase())), [keyword]);
  return (
    <Stack spacing={2}>
      <UiNotice />
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Grid container spacing={1.5}>
          <Grid item xs={12} md={4}><SearchInput fullWidth value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="자재코드, 종류, 품명, 규격 검색" /></Grid>
          <Grid item xs={6} md={2}><TextField fullWidth select size="small" label="공장" defaultValue="HN"><MenuItem value="HN">하노이</MenuItem></TextField></Grid>
          <Grid item xs={6} md={2}><TextField fullWidth select size="small" label="창고" defaultValue="all"><MenuItem value="all">전체</MenuItem><MenuItem value="default">기본 창고</MenuItem></TextField></Grid>
          <Grid item xs={6} md={2}><TextField fullWidth select size="small" label="소유자" defaultValue="all"><MenuItem value="all">전체</MenuItem><MenuItem value="baro">BARO</MenuItem><MenuItem value="customer">고객 소유</MenuItem></TextField></Grid>
          <Grid item xs={6} md={2}><TextField fullWidth select size="small" label="재고 상태" defaultValue="all"><MenuItem value="all">전체</MenuItem><MenuItem value="short">부족</MenuItem><MenuItem value="negative">음수</MenuItem></TextField></Grid>
        </Grid>
      </Paper>
      <Grid container spacing={2}>
        {[['등록 자재', '3개'], ['총 재고 위치', '3곳'], ['예약 품목', '3개'], ['부족·음수', '0개']].map(([label, value]) => (
          <Grid item xs={6} lg={3} key={label}><Card variant="outlined"><CardContent><Typography color="text.secondary" variant="body2">{label}</Typography><Typography variant="h5" fontWeight={800}>{value}</Typography></CardContent></Card></Grid>
        ))}
      </Grid>
      <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small"><TableHead><TableRow>{['자재코드', '자재 종류', '품명·규격', '색상', '단위', '소유자', '창고', '현재고', '예약', '가용재고'].map((label) => <TableCell key={label} align={['현재고','예약','가용재고'].includes(label) ? 'right' : 'left'}>{label}</TableCell>)}</TableRow></TableHead>
          <TableBody>{rows.map((item) => <TableRow hover key={item.code}><TableCell sx={{ fontWeight: 700 }}>{item.code}</TableCell><TableCell>{item.type}</TableCell><TableCell>{item.name}<Typography variant="caption" display="block" color="text.secondary">{item.spec}</Typography></TableCell><TableCell>{item.color}</TableCell><TableCell>{item.unit}</TableCell><TableCell>BARO</TableCell><TableCell>기본 창고</TableCell><TableCell align="right">{item.stock.toLocaleString()}</TableCell><TableCell align="right">{item.reserved.toLocaleString()}</TableCell><TableCell align="right" sx={{ fontWeight: 800 }}>{(item.stock-item.reserved).toLocaleString()}</TableCell></TableRow>)}</TableBody>
        </Table>
      </Paper>
    </Stack>
  );
};

const EntryView = () => {
  const navigate = useNavigate();
  const [type, setType] = useState('PURCHASE');
  const isTransfer = type === 'TRANSFER';
  const isDecrease = ['PRODUCTION_ISSUE', 'DELIVERY', 'LOSS'].includes(type);
  return (
    <Stack spacing={2}>
      <UiNotice />
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack spacing={2.5}>
          <Box><Typography variant="subtitle1" fontWeight={800}>거래 기본 정보</Typography><Typography variant="body2" color="text.secondary">거래 유형에 맞는 창고 방향만 입력합니다.</Typography></Box>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}><TextField fullWidth select size="small" label="거래 유형" value={type} onChange={(event) => setType(event.target.value)}>{[['PURCHASE','구매'],['CUSTOMER_IN','고객 지급 입고'],['TRANSFER','창고 이동'],['PRODUCTION_ISSUE','생산 투입'],['PRODUCTION_RETURN','생산 반환'],['DELIVERY','납품'],['LOSS','폐기·손실'],['ADJUSTMENT','실사 조정']].map(([value,label]) => <MenuItem value={value} key={value}>{label}</MenuItem>)}</TextField></Grid>
            <Grid item xs={12} md={4}><TextField fullWidth size="small" type="date" label="처리일" defaultValue="2026-08-05" InputLabelProps={{ shrink: true }} /></Grid>
            <Grid item xs={12} md={4}><TextField fullWidth size="small" label="증빙번호" placeholder="선택 입력" /></Grid>
            {(isDecrease || isTransfer) && <Grid item xs={12} md={6}><TextField fullWidth select size="small" label="출발 창고" defaultValue="default"><MenuItem value="default">하노이 / 기본 창고</MenuItem></TextField></Grid>}
            {(!isDecrease || isTransfer) && <Grid item xs={12} md={6}><TextField fullWidth select size="small" label="도착 창고" defaultValue="default"><MenuItem value="default">하노이 / 기본 창고</MenuItem></TextField></Grid>}
            <Grid item xs={12} md={6}><TextField fullWidth select size="small" label="소유자" defaultValue="baro"><MenuItem value="baro">BARO</MenuItem><MenuItem value="customer">고객 A</MenuItem></TextField></Grid>
            <Grid item xs={12} md={6}><TextField fullWidth size="small" label="공급처·고객" placeholder="선택 입력" /></Grid>
          </Grid>
          <Box><Typography variant="subtitle1" fontWeight={800}>자재 내역</Typography></Box>
          <Paper variant="outlined" sx={{ p: 2 }}><Grid container spacing={1.5}><Grid item xs={12} md={5}><TextField fullWidth select size="small" label="자재" defaultValue="MAT-000001">{MATERIALS.map((item) => <MenuItem key={item.code} value={item.code}>{item.code} · {item.name} · {item.color}</MenuItem>)}</TextField></Grid><Grid item xs={6} md={2}><TextField fullWidth size="small" label="수량" defaultValue="1000" /></Grid><Grid item xs={6} md={1}><TextField fullWidth size="small" label="단위" value="EA" InputProps={{ readOnly: true }} /></Grid><Grid item xs={6} md={2}><TextField fullWidth size="small" label="단가" placeholder="선택" /></Grid><Grid item xs={6} md={2}><TextField fullWidth select size="small" label="통화" defaultValue="VND"><MenuItem value="VND">VND</MenuItem><MenuItem value="USD">USD</MenuItem></TextField></Grid></Grid></Paper>
          <TextField fullWidth multiline minRows={2} label="메모" />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}><Button onClick={() => navigate('/inventory/movements')}>목록</Button><EmptyAction>거래 저장</EmptyAction></Box>
        </Stack>
      </Paper>
    </Stack>
  );
};

const HistoryView = () => {
  const navigate = useNavigate();
  return <Stack spacing={2}><UiNotice /><Box sx={{ display: 'flex', justifyContent: 'flex-end' }}><Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/inventory/movements/new')}>거래 등록</Button></Box><Paper variant="outlined" sx={{ p: 2 }}><Grid container spacing={1.5}><Grid item xs={12} md={4}><SearchInput fullWidth placeholder="문서번호, 자재, 처리자 검색" /></Grid><Grid item xs={6} md={2}><TextField fullWidth select size="small" label="거래 유형" defaultValue="all"><MenuItem value="all">전체</MenuItem></TextField></Grid><Grid item xs={6} md={2}><TextField fullWidth select size="small" label="창고" defaultValue="all"><MenuItem value="all">전체</MenuItem></TextField></Grid><Grid item xs={12} md={4}><TextField fullWidth size="small" label="조회 기간" defaultValue="2026-08-01 ~ 2026-08-05" /></Grid></Grid></Paper><Paper variant="outlined" sx={{ overflowX: 'auto' }}><Table size="small"><TableHead><TableRow>{['일자','거래 유형','문서번호','자재','수량','출발','도착','소유자','상태'].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{MOVEMENTS.map((row) => <TableRow hover key={row.doc}><TableCell>{row.date}</TableCell><TableCell><Chip size="small" label={row.type} variant="outlined" /></TableCell><TableCell sx={{ fontWeight: 700 }}>{row.doc}</TableCell><TableCell>{row.material}</TableCell><TableCell sx={{ fontWeight: 700 }}>{row.quantity}</TableCell><TableCell>{row.from}</TableCell><TableCell>{row.to}</TableCell><TableCell>{row.owner}</TableCell><TableCell><Chip size="small" color="success" label={row.status} /></TableCell></TableRow>)}</TableBody></Table></Paper></Stack>;
};

const MaterialDialog = ({ open, onClose }) => (
  <Dialog open={open} onClose={onClose} fullWidth maxWidth="md"><DialogTitle>자재 품목 등록</DialogTitle><DialogContent dividers><Stack spacing={2}><Alert severity="info">자재 종류를 먼저 선택하면 연결된 규격과 세부 구분만 제안됩니다.</Alert><Grid container spacing={2}><Grid item xs={12} md={4}><TextField fullWidth select size="small" label="자재 종류 *" defaultValue="SNAP"><MenuItem value="SNAP">일반 스냅</MenuItem><MenuItem value="FABRIC">겉감</MenuItem><MenuItem value="POLYBAG">폴리백</MenuItem></TextField></Grid><Grid item xs={12} md={4}><TextField fullWidth size="small" label="품명" placeholder="HS-SCW-90003" /></Grid><Grid item xs={12} md={4}><TextField fullWidth size="small" label="제조사" /></Grid><Grid item xs={12} md={4}><TextField fullWidth size="small" label="외부 고유번호" /></Grid><Grid item xs={6} md={2}><TextField fullWidth select size="small" label="색상" defaultValue="BLACK"><MenuItem value="BLACK">BLACK</MenuItem></TextField></Grid><Grid item xs={6} md={2}><TextField fullWidth select size="small" label="규격" defaultValue="13"><MenuItem value="13">13mm</MenuItem></TextField></Grid><Grid item xs={6} md={2}><TextField fullWidth select size="small" label="세부 구분" defaultValue="B"><MenuItem value="B">B</MenuItem></TextField></Grid><Grid item xs={6} md={2}><TextField fullWidth select size="small" label="단위 *" defaultValue="EA"><MenuItem value="EA">EA</MenuItem></TextField></Grid><Grid item xs={6} md={3}><TextField fullWidth select size="small" label="lot 관리" defaultValue="yes"><MenuItem value="yes">사용</MenuItem><MenuItem value="no">미사용</MenuItem></TextField></Grid><Grid item xs={6} md={3}><TextField fullWidth select size="small" label="기본 소비 유형" defaultValue="per"><MenuItem value="per">생산수량당 사용량</MenuItem><MenuItem value="pack">1단위당 포장 수량</MenuItem><MenuItem value="fixed">주문당 고정 사용량</MenuItem></TextField></Grid></Grid></Stack></DialogContent><DialogActions><Button onClick={onClose}>취소</Button><Button variant="contained" onClick={onClose}>등록</Button></DialogActions></Dialog>
);

const MaterialsView = () => {
  const [open, setOpen] = useState(false);
  return <Stack spacing={2}><UiNotice /><Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}><SearchInput placeholder="코드, 종류, 품명, 제조사, 규격 검색" sx={{ width: { xs: '100%', md: 460 } }} /><Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>자재 등록</Button></Box><Paper variant="outlined" sx={{ overflowX: 'auto' }}><Table size="small"><TableHead><TableRow>{['자재코드','자재 종류','품명','제조사','규격','색상','단위','lot 관리'].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{MATERIALS.map((item) => <TableRow hover key={item.code}><TableCell sx={{ fontWeight: 700 }}>{item.code}</TableCell><TableCell>{item.type}</TableCell><TableCell>{item.name}</TableCell><TableCell>{item.maker}</TableCell><TableCell>{item.spec}</TableCell><TableCell>{item.color}</TableCell><TableCell>{item.unit}</TableCell><TableCell>사용</TableCell></TableRow>)}</TableBody></Table></Paper><MaterialDialog open={open} onClose={() => setOpen(false)} /></Stack>;
};

const SettingsView = () => {
  const [tab, setTab] = useState('types');
  const labels = { types: ['코드','자재 종류','기본 단위','사용 속성'], units: ['코드','표시명','소수 자릿수','수량 방식'], specs: ['코드','표시값','자재 종류','구분'] };
  return <Stack spacing={2}><UiNotice /><Paper variant="outlined"><Tabs value={tab} onChange={(_event, value) => setTab(value)} variant="scrollable"><Tab value="types" label="자재 종류" /><Tab value="units" label="단위" /><Tab value="specs" label="규격·세부 구분" /><Tab value="colors" label="색상 연결" /></Tabs></Paper><Box sx={{ display: 'flex', justifyContent: 'flex-end' }}><Button variant="contained" startIcon={<AddIcon />}>새 항목</Button></Box>{tab === 'colors' ? <Alert severity="info">색상은 기존 공용 색상 마스터를 사용합니다. 이 화면에서는 자재 등록에 사용할 색상을 연결합니다.</Alert> : <Paper variant="outlined"><Table size="small"><TableHead><TableRow>{labels[tab].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{SETTINGS[tab].map((row) => <TableRow hover key={row.join('-')}>{row.map((value) => <TableCell key={value}>{value}</TableCell>)}</TableRow>)}</TableBody></Table></Paper>}</Stack>;
};

const InventoryWorkspace = ({ view = 'stock' }) => {
  const [title, description] = PAGE_META[view] || PAGE_META.stock;
  const content = { stock: <StockView />, entry: <EntryView />, history: <HistoryView />, materials: <MaterialsView />, settings: <SettingsView /> }[view] || <StockView />;
  return <AppPageContainer header={<Stack spacing={0.5}><Typography variant="h6" fontWeight={800}>{title}</Typography><Typography variant="body2" color="text.secondary">{description}</Typography></Stack>}>{content}</AppPageContainer>;
};

export default InventoryWorkspace;
