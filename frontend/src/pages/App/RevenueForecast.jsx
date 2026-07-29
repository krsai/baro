import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Divider, FormControl, IconButton, InputAdornment,
  InputLabel, MenuItem, Paper, Select, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import AppPageContainer from '../../components/AppPageContainer';
import { useLanguage } from '../../context/LanguageContext';

const STYLE_CATEGORIES = ['Jacket', 'Pants', 'Shirt', 'Dress', 'Skirt', 'Coat', 'Other'];
const SIMILAR_STYLES = [
  { id: 'AJ1972', category: 'Jacket', seconds: 2163 },
  { id: 'SAN-049', category: 'Jacket', seconds: 3121 },
  { id: 'CJ-009', category: 'Pants', seconds: 1480 },
];
const PURCHASE_HISTORY = [
  { id: 'snap-10', name: '가시 스냅 10mm', detail: '최근 구매가 · 2026-06-18', unitPrice: 850, unit: '개' },
  { id: 'zipper-60', name: '나일론 지퍼 60cm', detail: '최근 구매가 · 2026-05-27', unitPrice: 6200, unit: '개' },
  { id: 'polybag', name: '포장용 폴리백', detail: '최근 구매가 · 2026-07-03', unitPrice: 430, unit: '장' },
];
const FACTORIES = [
  { id: 'baro-1', name: 'BARO 1공장', monthlyFixed: 80000000, monthlyLaborPerWorker: 9000000, hoursDay: 8, workdays: 26 },
  { id: 'baro-2', name: 'BARO 2공장', monthlyFixed: 62000000, monthlyLaborPerWorker: 8200000, hoursDay: 8, workdays: 26 },
];

const TEXT = {
  ko: {
    title: '수익 예측',
    target: '1. 예측 대상', category: '스타일 카테고리', styleName: '예측 스타일명', quantity: '생산 수량',
    trade: '2. 거래 비용', productionType: '거래 형태 (참고)', costMethod: '부자재비 입력 방법', lumpSum: '총액 직접 입력', items: '구매이력에서 항목 추가', totalAccessory: '예상 부자재비 총액', purchaseItem: '구매 이력', itemQuantity: '사용 수량', addItem: '항목 추가', itemSubtotal: '예상 금액', noItems: '추가한 부자재 항목이 없습니다.', packaging: '포장재비 총액', logistics: '물류비 총액', tradeHint: 'CMT/FP와 관계없이 우리 회사에 발생하는 부자재·포장재·물류비를 입력하세요.',
    time: '3. 예상 작업시간', direct: '직접 입력', similar: '유사 스타일 참조', seconds: '한 벌 예상시간', similarStyle: '유사 스타일', timeHint: '같은 카테고리의 스타일만 표시합니다. 선택한 스타일의 ST를 시작값으로 가져옵니다.',
    production: '4. 생산 계획', factory: '생산 공장', workers: '투입 인원', factoryHint: '공장을 선택하면 해당 공장의 근무일·근무시간·고정비·인건비 기준으로 계산합니다.',
    cost: '5. 목표 이익', directCost: '기타 직접비 (한 벌)', margin: '목표 이익률',
    estimate: '예상 계산서', laborTime: '총 필요 작업시간', workerDays: '총 필요 인일', duration: '투입 인원 기준 예상 기간', completion: '예상 완료', accessoryCost: '부자재·포장·물류비', otherDirect: '기타 직접비', laborCost: '예상 변동 인건비', fixedCost: '기간 배부 고정비', totalCost: '예상 총원가', unitCost: '한 벌 원가', recommended: '필요한 한 벌 판매가', revenue: '필요한 총매출', profit: '목표 이익', assumption: '생산효율 100% 기준입니다. 실제 휴무·잔업·라인 효율은 추후 정책 확정 시 반영해야 합니다.',
  },
  en: {
    title: 'Profit Forecast',
    target: '1. Forecast Target', category: 'Style Category', styleName: 'Forecast Style Name', quantity: 'Production Quantity',
    trade: '2. Commercial Costs', productionType: 'Deal Type (Reference)', costMethod: 'Trims Cost Input', lumpSum: 'Enter Total', items: 'Add Purchase History Items', totalAccessory: 'Estimated Total Trims Cost', purchaseItem: 'Purchase History', itemQuantity: 'Usage Quantity', addItem: 'Add Item', itemSubtotal: 'Estimated Amount', noItems: 'No trim items added.', packaging: 'Total Packaging Cost', logistics: 'Total Logistics Cost', tradeHint: 'Enter costs paid by us regardless of whether the deal is CMT or FP.',
    time: '3. Estimated Work Time', direct: 'Direct Input', similar: 'Reference Similar Style', seconds: 'Seconds per Piece', similarStyle: 'Similar Style', timeHint: 'Only styles in the same category are shown. Its ST is used as a starting value.',
    production: '4. Production Plan', factory: 'Factory', workers: 'Workers', factoryHint: 'Factory workdays, hours, fixed costs, and labor rates are used automatically.',
    cost: '5. Profit Target', directCost: 'Other Direct Cost per Piece', margin: 'Target Profit Margin',
    estimate: 'Forecast Statement', laborTime: 'Total Required Labor Time', workerDays: 'Required Worker-days', duration: 'Estimated Duration', completion: 'Estimated Completion', accessoryCost: 'Trims, Packaging & Logistics', otherDirect: 'Other Direct Cost', laborCost: 'Estimated Variable Labor', fixedCost: 'Allocated Fixed Cost', totalCost: 'Estimated Total Cost', unitCost: 'Unit Cost', recommended: 'Required Unit Price', revenue: 'Required Revenue', profit: 'Target Profit', assumption: 'Assumes 100% efficiency. Holidays, overtime, and line efficiency can be included after policies are finalized.',
  },
};

const n = (value, fallback = 0) => Math.max(0, Number(value) || fallback);
const money = (value, languageCode) => `${new Intl.NumberFormat(languageCode === 'ko' ? 'ko-KR' : 'en-US', { maximumFractionDigits: 0 }).format(Math.round(n(value)))} ₫`;
const FieldCard = ({ title, children }) => <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}><Typography variant="subtitle1" fontWeight={700} gutterBottom>{title}</Typography><Stack spacing={2}>{children}</Stack></Paper>;
const Metric = ({ label, value, strong }) => <Stack direction="row" justifyContent="space-between" spacing={2}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant={strong ? 'subtitle1' : 'body2'} fontWeight={strong ? 800 : 600} textAlign="right">{value}</Typography></Stack>;
const CostField = ({ label, value, onChange, helperText }) => <TextField label={label} type="number" value={value} onChange={onChange} helperText={helperText} inputProps={{ min: 0 }} InputProps={{ endAdornment: <InputAdornment position="end">₫</InputAdornment> }} />;

const RevenueForecast = () => {
  const { languageCode } = useLanguage();
  const text = TEXT[languageCode] || TEXT.en;
  const [draft, setDraft] = useState({ category: 'Jacket', styleName: 'AJ2000', quantity: 300, productionType: 'CMT', accessoryMode: 'lump', accessoryLumpSum: 50000000, packagingCost: 1500000, logisticsCost: 3000000, selectedPurchaseId: 'snap-10', purchaseQuantity: 600, accessoryItems: [], timeMode: 'similar', similarStyleId: 'AJ1972', seconds: 2163, factoryId: 'baro-1', workers: 8, directCost: 120000, margin: 20 });
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
  const addAccessory = () => {
    const purchase = PURCHASE_HISTORY.find((item) => item.id === draft.selectedPurchaseId);
    if (!purchase) return;
    setDraft((current) => ({ ...current, accessoryItems: [...current.accessoryItems, { ...purchase, rowId: `${purchase.id}-${Date.now()}`, quantity: Math.max(1, n(current.purchaseQuantity, 1)) }] }));
  };
  const removeAccessory = (rowId) => setDraft((current) => ({ ...current, accessoryItems: current.accessoryItems.filter((item) => item.rowId !== rowId) }));
  const itemAccessoryTotal = draft.accessoryItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
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
          <FormControl><InputLabel>{text.category}</InputLabel><Select label={text.category} value={draft.category} onChange={selectCategory}>{STYLE_CATEGORIES.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}</Select></FormControl>
          <TextField label={text.styleName} value={draft.styleName} onChange={set('styleName')} />
          <TextField label={text.quantity} type="number" value={draft.quantity} onChange={set('quantity')} inputProps={{ min: 1 }} />
        </FieldCard>
        <FieldCard title={text.trade}>
          <Typography variant="caption" color="text.secondary">{text.tradeHint}</Typography>
          <ToggleButtonGroup exclusive fullWidth value={draft.productionType} onChange={set('productionType')} size="small"><ToggleButton value="CMT">CMT</ToggleButton><ToggleButton value="FP">FP</ToggleButton></ToggleButtonGroup>
          <ToggleButtonGroup exclusive fullWidth value={draft.accessoryMode} onChange={set('accessoryMode')} size="small"><ToggleButton value="lump">{text.lumpSum}</ToggleButton><ToggleButton value="items">{text.items}</ToggleButton></ToggleButtonGroup>
          {draft.accessoryMode === 'lump' ? <CostField label={text.totalAccessory} value={draft.accessoryLumpSum} onChange={set('accessoryLumpSum')} /> : <>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <FormControl sx={{ flex: 1 }}><InputLabel>{text.purchaseItem}</InputLabel><Select label={text.purchaseItem} value={draft.selectedPurchaseId} onChange={set('selectedPurchaseId')}>{PURCHASE_HISTORY.map((item) => <MenuItem key={item.id} value={item.id}><Box><Typography variant="body2">{item.name} · {money(item.unitPrice, languageCode)}/{item.unit}</Typography><Typography variant="caption" color="text.secondary">{item.detail}</Typography></Box></MenuItem>)}</Select></FormControl>
              <TextField sx={{ width: { sm: 130 } }} label={text.itemQuantity} type="number" value={draft.purchaseQuantity} onChange={set('purchaseQuantity')} inputProps={{ min: 1 }} />
              <Button variant="outlined" startIcon={<AddIcon />} onClick={addAccessory}>{text.addItem}</Button>
            </Stack>
            {draft.accessoryItems.length === 0 ? <Typography variant="body2" color="text.secondary">{text.noItems}</Typography> : draft.accessoryItems.map((item) => <Stack key={item.rowId} direction="row" alignItems="center" spacing={1} sx={{ bgcolor: 'action.hover', px: 1.5, py: 1, borderRadius: 1 }}><Box sx={{ flex: 1 }}><Typography variant="body2" fontWeight={600}>{item.name} · {item.quantity.toLocaleString()}{item.unit}</Typography><Typography variant="caption" color="text.secondary">{money(item.unitPrice, languageCode)}/{item.unit}</Typography></Box><Typography variant="body2" fontWeight={700}>{money(item.unitPrice * item.quantity, languageCode)}</Typography><IconButton size="small" onClick={() => removeAccessory(item.rowId)}><DeleteOutlineIcon fontSize="small" /></IconButton></Stack>)}
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
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, position: { xl: 'sticky' }, top: { xl: 16 } }}>
        <Typography variant="h6" fontWeight={800}>{text.estimate}</Typography><Typography variant="caption" color="text.secondary">{draft.styleName || '-'} · {result.qty.toLocaleString()} pcs · {factory.name}</Typography><Divider sx={{ my: 2 }} />
        <Stack spacing={1.25}><Metric label={text.laborTime} value={`${(result.laborSeconds / 3600).toFixed(1)} h`} /><Metric label={text.workerDays} value={`${result.workerDays.toFixed(1)} 인일`} /><Metric label={text.duration} value={`${result.durationDays.toFixed(1)} 일`} /><Metric label={text.completion} value={`D+${Math.ceil(result.durationDays)}`} /><Divider /><Metric label={text.accessoryCost} value={money(result.tradeCosts, languageCode)} /><Metric label={text.otherDirect} value={money(result.otherDirect, languageCode)} /><Metric label={text.laborCost} value={money(result.labor, languageCode)} /><Metric label={text.fixedCost} value={money(result.fixed, languageCode)} /><Metric label={text.totalCost} value={money(result.total, languageCode)} strong /><Metric label={text.unitCost} value={money(result.unitCost, languageCode)} /><Divider /><Metric label={text.recommended} value={money(result.unitPrice, languageCode)} strong /><Metric label={text.revenue} value={money(result.revenue, languageCode)} /><Metric label={text.profit} value={money(result.profit, languageCode)} strong /></Stack>
        <Alert severity="warning" sx={{ mt: 2 }}>{text.assumption}</Alert>
      </Paper>
    </Box>
  </Stack></AppPageContainer>;
};

export default RevenueForecast;
