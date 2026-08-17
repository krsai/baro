import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Divider, FormControl, IconButton, InputAdornment,
  InputLabel, MenuItem, Paper, Select, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined';
import AppPageContainer from '../../components/AppPageContainer';
import { useLanguage } from '../../context/LanguageContext';

const STYLE_CATEGORIES = ['Jacket', 'Pants', 'Shirt', 'Dress', 'Skirt', 'Coat', 'Other'];
const SIMILAR_STYLES = [
  { id: 'AJ1972', category: 'Jacket', seconds: 2163 },
  { id: 'SAN-049', category: 'Jacket', seconds: 3121 },
  { id: 'CJ-009', category: 'Pants', seconds: 1480 },
];
const PURCHASE_HISTORY = [
  { id: 'snap-10', name: '가시 스냅 10mm', detail: '최근 구매가 · 2026-06-18', unitPrice: 850, unit: '개', usageType: 'perPiece', usageValue: 10 },
  { id: 'zipper-60', name: '나일론 지퍼 60cm', detail: '최근 구매가 · 2026-05-27', unitPrice: 6200, unit: '개', usageType: 'perPiece', usageValue: 1 },
  { id: 'polybag', name: '포장용 폴리백', detail: '최근 구매가 · 2026-07-03', unitPrice: 430, unit: '장', usageType: 'perPiece', usageValue: 1 },
  { id: 'carton-60', name: '수출용 포장 박스', detail: '최근 구매가 · 2026-06-11', unitPrice: 25000, unit: '박스', usageType: 'capacity', usageValue: 60 },
];
const FACTORIES = [
  { id: 'baro-1', name: 'BARO 1공장', monthlyFixed: 80000000, monthlyLaborPerWorker: 9000000, hoursDay: 8, workdays: 26 },
  { id: 'baro-2', name: 'BARO 2공장', monthlyFixed: 62000000, monthlyLaborPerWorker: 8200000, hoursDay: 8, workdays: 26 },
];
const FORECAST_STORAGE_KEY = 'baro.revenueForecast.records.v1';

const TEXT = {
  ko: {
    title: '예가 산출',
    target: '1. 산출 대상', savedForecast: '저장된 예가 기록', selectForecast: '기록을 선택하세요', newForecast: '새 예가', saveForecast: '예가 저장', deleteForecast: '기록 삭제', category: '스타일 카테고리', styleName: '산출 스타일명', quantity: '생산 수량', unnamed: '이름 없는 예가',
    trade: '2. 거래 비용', productionType: '거래 형태 (참고)', costMethod: '부자재비 입력 방법', lumpSum: '총액 직접 입력', items: '구매이력에서 항목 추가', totalAccessory: '예상 부자재비 총액', purchaseItem: '구매 이력', perPieceUsage: '한 벌당 사용량', capacityUsage: '1개당 포장 수량', addItem: '항목 추가', itemSubtotal: '예상 금액', noItems: '추가한 부자재 항목이 없습니다.', packaging: '기타 포장재비 총액', logistics: '물류비 총액', tradeHint: 'CMT/FP와 관계없이 우리 회사에 발생하는 부자재·포장재·물류비를 입력하세요.', pieces: '벌', required: '필요',
    time: '3. 예상 작업시간', direct: '직접 입력', similar: '유사 스타일 참조', seconds: '한 벌 예상시간', similarStyle: '유사 스타일', timeHint: '같은 카테고리의 스타일만 표시합니다. 선택한 스타일의 ST를 시작값으로 가져옵니다.',
    production: '4. 생산 계획', factory: '생산 공장', workers: '투입 인원', factoryHint: '공장을 선택하면 해당 공장의 근무일·근무시간·고정비·인건비 기준으로 계산합니다.',
    cost: '5. 목표 이익', directCost: '기타 직접비 (한 벌)', margin: '목표 이익률',
    estimate: '예가 계산서', laborTime: '총 필요 작업시간', workerDays: '총 필요 인일', duration: '투입 인원 기준 예상 기간', completion: '예상 완료', accessoryCost: '부자재·포장·물류비', otherDirect: '기타 직접비', laborCost: '예상 변동 인건비', fixedCost: '기간 배부 고정비', totalCost: '예상 총원가', unitCost: '한 벌 원가', recommended: '필요한 한 벌 판매가', revenue: '필요한 총매출', profit: '목표 이익', assumption: '생산효율 100% 기준입니다. 실제 휴무·잔업·라인 효율은 추후 정책 확정 시 반영해야 합니다.',
  },
  en: {
    title: 'Cost Estimation',
    target: '1. Estimation Target', savedForecast: 'Saved Estimates', selectForecast: 'Select an estimate', newForecast: 'New Estimate', saveForecast: 'Save Estimate', deleteForecast: 'Delete', category: 'Style Category', styleName: 'Estimate Style Name', quantity: 'Production Quantity', unnamed: 'Untitled Estimate',
    trade: '2. Commercial Costs', productionType: 'Deal Type (Reference)', costMethod: 'Trims Cost Input', lumpSum: 'Enter Total', items: 'Add Purchase History Items', totalAccessory: 'Estimated Total Trims Cost', purchaseItem: 'Purchase History', perPieceUsage: 'Usage per Garment', capacityUsage: 'Garments per Unit', addItem: 'Add Item', itemSubtotal: 'Estimated Amount', noItems: 'No trim items added.', packaging: 'Other Packaging Cost', logistics: 'Total Logistics Cost', tradeHint: 'Enter costs paid by us regardless of whether the deal is CMT or FP.', pieces: 'garments', required: 'Required',
    time: '3. Estimated Work Time', direct: 'Direct Input', similar: 'Reference Similar Style', seconds: 'Seconds per Piece', similarStyle: 'Similar Style', timeHint: 'Only styles in the same category are shown. Its ST is used as a starting value.',
    production: '4. Production Plan', factory: 'Factory', workers: 'Workers', factoryHint: 'Factory workdays, hours, fixed costs, and labor rates are used automatically.',
    cost: '5. Profit Target', directCost: 'Other Direct Cost per Piece', margin: 'Target Profit Margin',
    estimate: 'Cost Estimate', laborTime: 'Total Required Labor Time', workerDays: 'Required Worker-days', duration: 'Estimated Duration', completion: 'Estimated Completion', accessoryCost: 'Trims, Packaging & Logistics', otherDirect: 'Other Direct Cost', laborCost: 'Estimated Variable Labor', fixedCost: 'Allocated Fixed Cost', totalCost: 'Estimated Total Cost', unitCost: 'Unit Cost', recommended: 'Required Unit Price', revenue: 'Required Revenue', profit: 'Target Profit', assumption: 'Assumes 100% efficiency. Holidays, overtime, and line efficiency can be included after policies are finalized.',
  },
  vi: {
    title: 'Tính giá dự toán',
    target: '1. Đối tượng tính giá', savedForecast: 'Dự toán đã lưu', selectForecast: 'Chọn một dự toán', newForecast: 'Dự toán mới', saveForecast: 'Lưu dự toán', deleteForecast: 'Xóa', category: 'Loại kiểu dáng', styleName: 'Tên kiểu dáng dự toán', quantity: 'Số lượng sản xuất', unnamed: 'Dự toán chưa đặt tên',
    trade: '2. Chi phí giao dịch', productionType: 'Loại giao dịch (tham khảo)', costMethod: 'Cách nhập chi phí phụ liệu', lumpSum: 'Nhập tổng tiền', items: 'Thêm từ lịch sử mua hàng', totalAccessory: 'Tổng chi phí phụ liệu dự kiến', purchaseItem: 'Lịch sử mua hàng', perPieceUsage: 'Mức dùng mỗi sản phẩm', capacityUsage: 'Số sản phẩm mỗi đơn vị', addItem: 'Thêm mục', itemSubtotal: 'Số tiền dự kiến', noItems: 'Chưa thêm phụ liệu.', packaging: 'Chi phí đóng gói khác', logistics: 'Tổng chi phí logistics', tradeHint: 'Nhập các chi phí do công ty chi trả, không phụ thuộc hình thức CMT hay FP.', pieces: 'sản phẩm', required: 'Cần thiết',
    time: '3. Thời gian làm việc dự kiến', direct: 'Nhập trực tiếp', similar: 'Tham khảo kiểu dáng tương tự', seconds: 'Số giây mỗi sản phẩm', similarStyle: 'Kiểu dáng tương tự', timeHint: 'Chỉ hiển thị kiểu dáng cùng loại. ST của kiểu được chọn được dùng làm giá trị ban đầu.',
    production: '4. Kế hoạch sản xuất', factory: 'Nhà máy', workers: 'Nhân lực', factoryHint: 'Ngày làm việc, giờ làm, chi phí cố định và đơn giá nhân công của nhà máy được áp dụng tự động.',
    cost: '5. Mục tiêu lợi nhuận', directCost: 'Chi phí trực tiếp khác mỗi sản phẩm', margin: 'Tỷ suất lợi nhuận mục tiêu',
    estimate: 'Bảng tính giá dự toán', laborTime: 'Tổng thời gian lao động cần thiết', workerDays: 'Tổng ngày công cần thiết', duration: 'Thời gian dự kiến', completion: 'Hoàn thành dự kiến', accessoryCost: 'Phụ liệu, đóng gói và logistics', otherDirect: 'Chi phí trực tiếp khác', laborCost: 'Nhân công biến đổi dự kiến', fixedCost: 'Chi phí cố định phân bổ', totalCost: 'Tổng giá thành dự kiến', unitCost: 'Giá thành đơn vị', recommended: 'Đơn giá bán cần thiết', revenue: 'Doanh thu cần thiết', profit: 'Lợi nhuận mục tiêu', assumption: 'Giả định hiệu suất 100%. Ngày nghỉ, tăng ca và hiệu suất chuyền sẽ được phản ánh sau khi chính sách được xác định.',
  },
};

const n = (value, fallback = 0) => Math.max(0, Number(value) || fallback);
const requiredQuantity = (item, orderQuantity) => item.usageType === 'capacity'
  ? Math.ceil(Math.max(1, n(orderQuantity, 1)) / Math.max(1, n(item.usageValue, 1)))
  : Math.ceil(Math.max(1, n(orderQuantity, 1)) * Math.max(0, n(item.usageValue)));
const money = (value, languageCode) => `${new Intl.NumberFormat(languageCode === 'ko' ? 'ko-KR' : 'en-US', { maximumFractionDigits: 0 }).format(Math.round(n(value)))} ₫`;
const FieldCard = ({ title, children }) => <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}><Typography variant="subtitle1" fontWeight={700} gutterBottom>{title}</Typography><Stack spacing={2}>{children}</Stack></Paper>;
const Metric = ({ label, value, strong }) => <Stack direction="row" justifyContent="space-between" spacing={2}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant={strong ? 'subtitle1' : 'body2'} fontWeight={strong ? 800 : 600} textAlign="right" sx={{ fontFamily: strong ? 'inherit' : 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{value}</Typography></Stack>;
const CostField = ({ label, value, onChange, helperText }) => <TextField label={label} type="number" value={value} onChange={onChange} helperText={helperText} inputProps={{ min: 0 }} InputProps={{ endAdornment: <InputAdornment position="end">₫</InputAdornment> }} />;
const ReceiptDivider = () => <Divider sx={{ borderStyle: 'dashed', borderColor: 'rgba(80, 70, 50, .35)' }} />;

const createInitialDraft = () => ({ category: 'Jacket', styleName: 'AJ2000', quantity: 300, productionType: 'CMT', accessoryMode: 'lump', accessoryLumpSum: 50000000, packagingCost: 1500000, logisticsCost: 3000000, selectedPurchaseId: 'snap-10', usageValue: 10, accessoryItems: [], timeMode: 'similar', similarStyleId: 'AJ1972', seconds: 2163, factoryId: 'baro-1', workers: 8, directCost: 120000, margin: 20 });
const loadForecastRecords = () => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FORECAST_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const RevenueForecast = () => {
  const { languageCode } = useLanguage();
  const text = TEXT[languageCode] || TEXT.en;
  const [draft, setDraft] = useState(createInitialDraft);
  const [forecastRecords, setForecastRecords] = useState(loadForecastRecords);
  const [selectedForecastId, setSelectedForecastId] = useState('');
  const forecastRecordLabel = (record) => `${record.name} · ${Number(record.draft?.quantity || 0).toLocaleString()} pcs · ${new Date(record.savedAt).toLocaleDateString(languageCode)}`;
  const set = (key) => (event, value) => setDraft((current) => ({ ...current, [key]: value ?? event.target.value }));
  const factory = FACTORIES.find((item) => item.id === draft.factoryId) || FACTORIES[0];
  const similarStyles = SIMILAR_STYLES.filter((style) => style.category === draft.category);
  const selectCategory = (event) => {
    const category = event.target.value;
    const first = SIMILAR_STYLES.find((style) => style.category === category);
    setDraft((current) => ({ ...current, category, similarStyleId: first?.id || '', seconds: first?.seconds || current.seconds }));
  };
  const selectSimilar = (event) => {
    const found = SIMILAR_STYLES.find((item) => item.id === event.target.value);
    setDraft((current) => ({ ...current, similarStyleId: event.target.value, seconds: found?.seconds || current.seconds }));
  };
  const selectPurchase = (event) => {
    const purchase = PURCHASE_HISTORY.find((item) => item.id === event.target.value);
    setDraft((current) => ({ ...current, selectedPurchaseId: event.target.value, usageValue: purchase?.usageValue || 1 }));
  };
  const addAccessory = () => {
    const purchase = PURCHASE_HISTORY.find((item) => item.id === draft.selectedPurchaseId);
    if (!purchase) return;
    setDraft((current) => ({ ...current, accessoryItems: [...current.accessoryItems, { ...purchase, rowId: `${purchase.id}-${Date.now()}`, usageValue: Math.max(0.01, n(current.usageValue, 1)) }] }));
  };
  const removeAccessory = (rowId) => setDraft((current) => ({ ...current, accessoryItems: current.accessoryItems.filter((item) => item.rowId !== rowId) }));
  const persistForecastRecords = (records) => {
    setForecastRecords(records);
    window.localStorage.setItem(FORECAST_STORAGE_KEY, JSON.stringify(records));
  };
  const saveForecast = () => {
    const now = new Date().toISOString();
    const id = selectedForecastId || `forecast-${Date.now()}`;
    const record = { id, name: draft.styleName.trim() || text.unnamed, savedAt: now, draft };
    const records = selectedForecastId
      ? forecastRecords.map((item) => item.id === selectedForecastId ? record : item)
      : [record, ...forecastRecords];
    persistForecastRecords(records);
    setSelectedForecastId(id);
  };
  const selectForecast = (event) => {
    const id = event.target.value;
    const record = forecastRecords.find((item) => item.id === id);
    setSelectedForecastId(id);
    if (record?.draft) setDraft({ ...createInitialDraft(), ...record.draft });
  };
  const newForecast = () => {
    setSelectedForecastId('');
    setDraft(createInitialDraft());
  };
  const deleteForecast = () => {
    if (!selectedForecastId) return;
    persistForecastRecords(forecastRecords.filter((item) => item.id !== selectedForecastId));
    newForecast();
  };
  const selectedPurchase = PURCHASE_HISTORY.find((item) => item.id === draft.selectedPurchaseId) || PURCHASE_HISTORY[0];
  const itemAccessoryTotal = draft.accessoryItems.reduce((sum, item) => sum + item.unitPrice * requiredQuantity(item, draft.quantity), 0);
  const accessoryTotal = draft.accessoryMode === 'lump' ? n(draft.accessoryLumpSum) : itemAccessoryTotal;
  const result = useMemo(() => {
    const qty = Math.max(1, Math.round(n(draft.quantity, 1)));
    const laborSeconds = qty * Math.max(1, n(draft.seconds, 1));
    const workerDays = laborSeconds / (factory.hoursDay * 3600);
    const durationDays = workerDays / Math.max(1, n(draft.workers, 1));
    const tradeCosts = accessoryTotal + n(draft.packagingCost) + n(draft.logisticsCost);
    const otherDirect = qty * n(draft.directCost);
    const labor = factory.monthlyLaborPerWorker * workerDays / factory.workdays;
    const fixed = factory.monthlyFixed * durationDays / factory.workdays;
    const total = tradeCosts + otherDirect + labor + fixed;
    const margin = Math.min(95, n(draft.margin)) / 100;
    const revenue = total / (1 - margin);
    return { qty, laborSeconds, workerDays, durationDays, tradeCosts, otherDirect, labor, fixed, total, unitCost: total / qty, unitPrice: revenue / qty, revenue, profit: revenue - total };
  }, [draft, factory, accessoryTotal]);

  return <AppPageContainer title={text.title}><Stack spacing={2.5}>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(380px, .95fr) minmax(420px, 1.05fr)' }, gap: 2.5, alignItems: 'start' }}>
      <Stack spacing={2}>
        <FieldCard title={text.target}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <FormControl sx={{ flex: 1 }}>
              <InputLabel shrink>{text.savedForecast}</InputLabel>
              <Select
                label={text.savedForecast}
                value={selectedForecastId}
                onChange={selectForecast}
                displayEmpty
                renderValue={(value) => {
                  const record = forecastRecords.find((item) => item.id === value);
                  return record
                    ? forecastRecordLabel(record)
                    : <Typography component="span" color="text.secondary">{text.selectForecast}</Typography>;
                }}
              >
                <MenuItem value="" disabled>{text.selectForecast}</MenuItem>
                {forecastRecords.map((record) => <MenuItem key={record.id} value={record.id}>{forecastRecordLabel(record)}</MenuItem>)}
              </Select>
            </FormControl>
            <Button variant="outlined" startIcon={<NoteAddOutlinedIcon />} onClick={newForecast}>{text.newForecast}</Button>
          </Stack>
          <FormControl><InputLabel>{text.category}</InputLabel><Select label={text.category} value={draft.category} onChange={selectCategory}>{STYLE_CATEGORIES.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}</Select></FormControl>
          <TextField label={text.styleName} value={draft.styleName} onChange={set('styleName')} />
          <TextField label={text.quantity} type="number" value={draft.quantity} onChange={set('quantity')} inputProps={{ min: 1 }} />
          <Stack direction="row" spacing={1} justifyContent="flex-end"><Button color="error" variant="text" startIcon={<DeleteOutlineIcon />} onClick={deleteForecast} disabled={!selectedForecastId}>{text.deleteForecast}</Button><Button variant="contained" startIcon={<SaveOutlinedIcon />} onClick={saveForecast}>{text.saveForecast}</Button></Stack>
        </FieldCard>
        <FieldCard title={text.trade}>
          <Typography variant="caption" color="text.secondary">{text.tradeHint}</Typography>
          <ToggleButtonGroup exclusive fullWidth value={draft.productionType} onChange={set('productionType')} size="small"><ToggleButton value="CMT">CMT</ToggleButton><ToggleButton value="FP">FP</ToggleButton></ToggleButtonGroup>
          <ToggleButtonGroup exclusive fullWidth value={draft.accessoryMode} onChange={set('accessoryMode')} size="small"><ToggleButton value="lump">{text.lumpSum}</ToggleButton><ToggleButton value="items">{text.items}</ToggleButton></ToggleButtonGroup>
          {draft.accessoryMode === 'lump' ? <CostField label={text.totalAccessory} value={draft.accessoryLumpSum} onChange={set('accessoryLumpSum')} /> : <>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <FormControl sx={{ flex: 1 }}><InputLabel>{text.purchaseItem}</InputLabel><Select label={text.purchaseItem} value={draft.selectedPurchaseId} onChange={selectPurchase}>{PURCHASE_HISTORY.map((item) => <MenuItem key={item.id} value={item.id}><Box><Typography variant="body2">{item.name} · {money(item.unitPrice, languageCode)}/{item.unit}</Typography><Typography variant="caption" color="text.secondary">{item.detail}</Typography></Box></MenuItem>)}</Select></FormControl>
              <TextField sx={{ width: { sm: 155 } }} label={selectedPurchase.usageType === 'capacity' ? text.capacityUsage : text.perPieceUsage} type="number" value={draft.usageValue} onChange={set('usageValue')} inputProps={{ min: 0.01, step: 0.01 }} InputProps={{ endAdornment: <InputAdornment position="end">{selectedPurchase.usageType === 'capacity' ? text.pieces : selectedPurchase.unit}</InputAdornment> }} />
              <Button variant="outlined" startIcon={<AddIcon />} onClick={addAccessory}>{text.addItem}</Button>
            </Stack>
            {draft.accessoryItems.length === 0 ? <Typography variant="body2" color="text.secondary">{text.noItems}</Typography> : draft.accessoryItems.map((item) => { const requiredQty = requiredQuantity(item, draft.quantity); return <Stack key={item.rowId} direction="row" alignItems="center" spacing={1} sx={{ bgcolor: 'action.hover', px: 1.5, py: 1, borderRadius: 1 }}><Box sx={{ flex: 1 }}><Typography variant="body2" fontWeight={600}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.usageType === 'capacity' ? `${item.unit}당 ${item.usageValue}${text.pieces}` : `한 벌당 ${item.usageValue}${item.unit}`} · {text.required} {requiredQty.toLocaleString()}{item.unit} · {money(item.unitPrice, languageCode)}/{item.unit}</Typography></Box><Typography variant="body2" fontWeight={700}>{money(item.unitPrice * requiredQty, languageCode)}</Typography><IconButton size="small" onClick={() => removeAccessory(item.rowId)}><DeleteOutlineIcon fontSize="small" /></IconButton></Stack>; })}
            <Metric label={text.itemSubtotal} value={money(itemAccessoryTotal, languageCode)} strong />
          </>}
          <CostField label={text.packaging} value={draft.packagingCost} onChange={set('packagingCost')} />
          <CostField label={text.logistics} value={draft.logisticsCost} onChange={set('logisticsCost')} />
        </FieldCard>
        <FieldCard title={text.time}>
          <ToggleButtonGroup exclusive fullWidth value={draft.timeMode} onChange={set('timeMode')} size="small"><ToggleButton value="direct">{text.direct}</ToggleButton><ToggleButton value="similar">{text.similar}</ToggleButton></ToggleButtonGroup>
          {draft.timeMode === 'similar' && <FormControl><InputLabel>{text.similarStyle}</InputLabel><Select label={text.similarStyle} value={draft.similarStyleId} onChange={selectSimilar} displayEmpty>{similarStyles.length ? similarStyles.map((style) => <MenuItem key={style.id} value={style.id}>{style.id} · {style.category} · {style.seconds.toLocaleString()} sec</MenuItem>) : <MenuItem value="" disabled>같은 카테고리의 스타일이 없습니다</MenuItem>}</Select></FormControl>}
          <TextField label={text.seconds} type="number" value={draft.seconds} onChange={set('seconds')} InputProps={{ endAdornment: <InputAdornment position="end">sec</InputAdornment> }} helperText={draft.timeMode === 'similar' ? text.timeHint : undefined} />
        </FieldCard>
        <FieldCard title={text.production}>
          <FormControl><InputLabel>{text.factory}</InputLabel><Select label={text.factory} value={draft.factoryId} onChange={set('factoryId')}>{FACTORIES.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</Select></FormControl>
          <TextField label={text.workers} type="number" value={draft.workers} onChange={set('workers')} inputProps={{ min: 1 }} />
          <Typography variant="caption" color="text.secondary">{text.factoryHint}</Typography>
        </FieldCard>
        <FieldCard title={text.cost}><CostField label={text.directCost} value={draft.directCost} onChange={set('directCost')} /><TextField label={text.margin} type="number" value={draft.margin} onChange={set('margin')} inputProps={{ min: 0, max: 95 }} InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} /></FieldCard>
      </Stack>
      <Paper elevation={4} sx={{ p: { xs: 2.5, sm: 4 }, pb: { xs: 4, sm: 5 }, borderRadius: 0, border: '1px solid rgba(110, 95, 65, .16)', position: { xs: 'relative', xl: 'sticky' }, top: { xl: 16 }, overflow: 'hidden', bgcolor: '#fffdf7', backgroundImage: 'repeating-linear-gradient(0deg, rgba(105, 90, 60, .018) 0, rgba(105, 90, 60, .018) 1px, transparent 1px, transparent 4px)', boxShadow: '0 10px 30px rgba(65, 55, 35, .14)', '&::after': { content: '""', position: 'absolute', left: 0, right: 0, bottom: -1, height: 12, background: 'linear-gradient(135deg, transparent 6px, #fffdf7 0) 0 0/12px 12px repeat-x, linear-gradient(45deg, #fffdf7 6px, transparent 0) 0 0/12px 12px repeat-x' } }}>
        <Stack alignItems="center" spacing={0.5}><Typography variant="overline" sx={{ letterSpacing: '.22em', color: 'text.secondary' }}>BARO GARMENT</Typography><Typography variant="h6" fontWeight={800}>{text.estimate}</Typography><Typography variant="caption" color="text.secondary">{draft.styleName || '-'} · {result.qty.toLocaleString()} pcs · {factory.name}</Typography></Stack><Divider sx={{ my: 2.5, borderStyle: 'dashed', borderColor: 'rgba(80, 70, 50, .35)' }} />
        <Stack spacing={1.25}><Metric label={text.laborTime} value={`${(result.laborSeconds / 3600).toFixed(1)} h`} /><Metric label={text.workerDays} value={`${result.workerDays.toFixed(1)} 인일`} /><Metric label={text.duration} value={`${result.durationDays.toFixed(1)} 일`} /><Metric label={text.completion} value={`D+${Math.ceil(result.durationDays)}`} /><ReceiptDivider /><Metric label={text.accessoryCost} value={money(result.tradeCosts, languageCode)} /><Metric label={text.otherDirect} value={money(result.otherDirect, languageCode)} /><Metric label={text.laborCost} value={money(result.labor, languageCode)} /><Metric label={text.fixedCost} value={money(result.fixed, languageCode)} /><Metric label={text.totalCost} value={money(result.total, languageCode)} strong /><Metric label={text.unitCost} value={money(result.unitCost, languageCode)} /><ReceiptDivider /><Metric label={text.recommended} value={money(result.unitPrice, languageCode)} strong /><Metric label={text.revenue} value={money(result.revenue, languageCode)} /><Metric label={text.profit} value={money(result.profit, languageCode)} strong /></Stack>
        <Alert severity="warning" sx={{ mt: 2 }}>{text.assumption}</Alert>
      </Paper>
    </Box>
  </Stack></AppPageContainer>;
};

export default RevenueForecast;
