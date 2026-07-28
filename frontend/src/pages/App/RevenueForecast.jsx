import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Chip, Divider, FormControl, InputAdornment, InputLabel, MenuItem,
  Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import { useLanguage } from '../../context/LanguageContext';

const SIMILAR_STYLES = [
  { id: 'AJ1972', name: 'AJ1972', category: 'Jacket', seconds: 2163 },
  { id: 'SAN-049', name: 'SAN-049', category: 'Jacket', seconds: 3121 },
  { id: 'CJ-009', name: 'CJ-009', category: 'Pants', seconds: 1480 },
];
const TEXT = {
  ko: {
    title: '수익 예측', prototype: 'UI 시뮬레이션', notice: '입력값으로 화면에서만 즉시 계산하는 시안입니다. 저장하거나 실제 ST·비용 데이터를 변경하지 않습니다.',
    target: '1. 예측 대상', category: '스타일 종류', styleName: '예측 스타일명', quantity: '생산 수량',
    time: '2. 예상 작업시간', direct: '직접 입력', similar: '유사 스타일 참조', seconds: '한 벌 예상시간', similarStyle: '비슷한 스타일', bucketNote: '향후 실제 개발에서는 입력 수량에 맞는 관계 범위 ST(q) 버킷과 버전을 조회합니다.',
    production: '3. 생산 조건', workers: '투입 인원', hoursDay: '1일 근무시간', workdays: '월 근무일', wage: '1인 월 인건비',
    cost: '4. 비용과 목표', fixed: '월 고정비', directCost: '한 벌 직접비', margin: '목표 이익률', fixedHint: '임대료·전기료·관리비 등 월 고정비 합계', directHint: '재료비·외주비 등 한 벌당 직접 발생 비용',
    estimate: '예상 계산서', assumption: '인원 기준 · 생산효율 100% · 월 고정비는 예상 생산일 비율로 배부', laborTime: '총 필요 노동시간', duration: '예상 생산기간', completion: '예상 완료', materialCost: '직접비', laborCost: '배부 인건비', fixedCost: '배부 고정비', totalCost: '예상 총원가', unitCost: '한 벌 원가', recommended: '권장 한 벌 판매가', revenue: '예상 총매출', profit: '예상 이익',
    monthly: '1개월 환산', monthlyQty: '월 생산 가능 수량', monthlyRevenue: '월 예상 매출', monthlyProfit: '월 예상 이익',
    compare: '수량별 비교', q: '수량', days: '기간', costPer: '개당 원가', pricePer: '권장 판매가', totalProfit: '예상 이익', disclaimer: '현재 계산식은 화면 구성을 검토하기 위한 가정입니다. CT 기반 생산수당, 실제 근무일, 생산효율과 고정비 배부 정책은 구현 전에 확정해야 합니다.',
  },
  en: {
    title: 'Profit Forecast', prototype: 'UI Simulation', notice: 'This draft calculates instantly in the browser. It does not save or change actual ST or cost data.',
    target: '1. Forecast Target', category: 'Style Type', styleName: 'Forecast Style Name', quantity: 'Production Quantity',
    time: '2. Estimated Work Time', direct: 'Direct Input', similar: 'Reference Similar Style', seconds: 'Seconds per Piece', similarStyle: 'Similar Style', bucketNote: 'The final version will resolve the relationship-scoped ST(q) bucket and version for the entered quantity.',
    production: '3. Production Conditions', workers: 'Workers', hoursDay: 'Hours per Day', workdays: 'Workdays per Month', wage: 'Monthly Labor Cost per Worker',
    cost: '4. Costs and Target', fixed: 'Monthly Fixed Cost', directCost: 'Direct Cost per Piece', margin: 'Target Profit Margin', fixedHint: 'Total monthly rent, electricity, management, and other fixed costs', directHint: 'Materials, outsourcing, and other direct cost per piece',
    estimate: 'Forecast Statement', assumption: 'Headcount basis · 100% efficiency · fixed costs allocated by estimated production days', laborTime: 'Total Labor Time', duration: 'Estimated Duration', completion: 'Estimated Completion', materialCost: 'Direct Cost', laborCost: 'Allocated Labor', fixedCost: 'Allocated Fixed Cost', totalCost: 'Estimated Total Cost', unitCost: 'Unit Cost', recommended: 'Recommended Unit Price', revenue: 'Expected Revenue', profit: 'Expected Profit',
    monthly: 'Monthly Conversion', monthlyQty: 'Monthly Capacity', monthlyRevenue: 'Expected Monthly Revenue', monthlyProfit: 'Expected Monthly Profit',
    compare: 'Quantity Comparison', q: 'Quantity', days: 'Duration', costPer: 'Unit Cost', pricePer: 'Recommended Price', totalProfit: 'Expected Profit', disclaimer: 'These formulas are assumptions for reviewing the UI. CT-based production allowance, actual workdays, efficiency, and fixed-cost allocation must be finalized before implementation.',
  },
  vi: {
    title: 'Dự báo lợi nhuận', prototype: 'Mô phỏng UI', notice: 'Bản mẫu tính ngay trên trình duyệt. Không lưu hoặc thay đổi dữ liệu ST và chi phí thực tế.',
    target: '1. Đối tượng dự báo', category: 'Loại kiểu dáng', styleName: 'Tên kiểu dáng dự báo', quantity: 'Số lượng sản xuất',
    time: '2. Thời gian dự kiến', direct: 'Nhập trực tiếp', similar: 'Tham khảo kiểu tương tự', seconds: 'Giây mỗi sản phẩm', similarStyle: 'Kiểu dáng tương tự', bucketNote: 'Bản chính thức sẽ tìm bucket và phiên bản ST(q) theo quan hệ phù hợp với số lượng đã nhập.',
    production: '3. Điều kiện sản xuất', workers: 'Số người', hoursDay: 'Giờ làm mỗi ngày', workdays: 'Ngày làm mỗi tháng', wage: 'Chi phí lao động tháng mỗi người',
    cost: '4. Chi phí và mục tiêu', fixed: 'Chi phí cố định tháng', directCost: 'Chi phí trực tiếp mỗi sản phẩm', margin: 'Tỷ suất lợi nhuận mục tiêu', fixedHint: 'Tổng tiền thuê, điện, quản lý và chi phí cố định hàng tháng', directHint: 'Nguyên liệu, gia công ngoài và chi phí trực tiếp mỗi sản phẩm',
    estimate: 'Bảng tính dự báo', assumption: 'Theo nhân lực · hiệu suất 100% · phân bổ chi phí cố định theo số ngày sản xuất', laborTime: 'Tổng thời gian lao động', duration: 'Thời gian dự kiến', completion: 'Hoàn thành dự kiến', materialCost: 'Chi phí trực tiếp', laborCost: 'Chi phí lao động phân bổ', fixedCost: 'Chi phí cố định phân bổ', totalCost: 'Tổng giá thành dự kiến', unitCost: 'Giá thành đơn vị', recommended: 'Giá bán đơn vị đề xuất', revenue: 'Doanh thu dự kiến', profit: 'Lợi nhuận dự kiến',
    monthly: 'Quy đổi một tháng', monthlyQty: 'Sản lượng tháng', monthlyRevenue: 'Doanh thu tháng dự kiến', monthlyProfit: 'Lợi nhuận tháng dự kiến',
    compare: 'So sánh số lượng', q: 'Số lượng', days: 'Thời gian', costPer: 'Giá thành đơn vị', pricePer: 'Giá đề xuất', totalProfit: 'Lợi nhuận dự kiến', disclaimer: 'Công thức hiện tại chỉ là giả định để xem xét UI. Phụ cấp sản lượng theo CT, ngày làm thực tế, hiệu suất và chính sách phân bổ chi phí cố định phải được xác định trước khi phát triển.',
  },
};

const number = (value, fallback = 0) => Math.max(0, Number(value) || fallback);
const money = (value, languageCode) => `${new Intl.NumberFormat(languageCode === 'vi' ? 'vi-VN' : languageCode === 'ko' ? 'ko-KR' : 'en-US', { maximumFractionDigits: 0 }).format(Math.round(number(value)))} ₫`;
const FieldCard = ({ title, children }) => <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}><Typography variant="subtitle1" fontWeight={700} gutterBottom>{title}</Typography><Stack spacing={2}>{children}</Stack></Paper>;
const Metric = ({ label, value, strong }) => <Stack direction="row" justifyContent="space-between" spacing={2}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant={strong ? 'subtitle1' : 'body2'} fontWeight={strong ? 800 : 600} textAlign="right">{value}</Typography></Stack>;

const RevenueForecast = () => {
  const { languageCode } = useLanguage();
  const text = TEXT[languageCode] || TEXT.en;
  const [draft, setDraft] = useState({ category: 'Jacket', styleName: 'AJ2000', quantity: 300, timeMode: 'similar', similarStyleId: 'AJ1972', seconds: 2163, workers: 8, hoursDay: 8, workdays: 26, wage: 9000000, fixed: 80000000, directCost: 120000, margin: 20 });
  const set = (key) => (event, value) => setDraft((current) => ({ ...current, [key]: value ?? event.target.value }));
  const selectSimilar = (event) => { const found = SIMILAR_STYLES.find((item) => item.id === event.target.value); setDraft((current) => ({ ...current, similarStyleId: event.target.value, seconds: found?.seconds || current.seconds })); };
  const calculate = (quantity) => {
    const qty = Math.max(1, Math.round(number(quantity, 1))); const seconds = Math.max(1, number(draft.seconds, 1));
    const workers = Math.max(1, number(draft.workers, 1)); const hoursDay = Math.max(1, number(draft.hoursDay, 1)); const workdays = Math.max(1, number(draft.workdays, 1));
    const laborSeconds = qty * seconds; const durationDays = laborSeconds / (workers * hoursDay * 3600);
    const direct = qty * number(draft.directCost); const labor = number(draft.wage) * workers * durationDays / workdays; const fixed = number(draft.fixed) * durationDays / workdays;
    const total = direct + labor + fixed; const margin = Math.min(95, number(draft.margin)) / 100; const revenue = total / (1 - margin); const profit = revenue - total;
    return { qty, laborSeconds, durationDays, direct, labor, fixed, total, unitCost: total / qty, unitPrice: revenue / qty, revenue, profit };
  };
  const result = useMemo(() => calculate(draft.quantity), [draft]);
  const comparisons = useMemo(() => [0.5, 1, 1.5, 2].map((ratio) => calculate(Math.max(1, Math.round(number(draft.quantity, 1) * ratio)))), [draft]);
  const monthlyQty = Math.floor(number(draft.workers, 1) * number(draft.hoursDay, 1) * 3600 * number(draft.workdays, 1) / Math.max(1, number(draft.seconds, 1)));
  const monthly = calculate(monthlyQty);

  return <AppPageContainer title={text.title}><Stack spacing={2.5}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}><Chip label={text.prototype} color="warning" variant="outlined" /><Alert severity="info" sx={{ flex: 1 }}>{text.notice}</Alert></Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.35fr) minmax(380px, 0.65fr)' }, gap: 2.5, alignItems: 'start' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <FieldCard title={text.target}><TextField label={text.category} value={draft.category} onChange={set('category')} /><TextField label={text.styleName} value={draft.styleName} onChange={set('styleName')} /><TextField label={text.quantity} type="number" value={draft.quantity} onChange={set('quantity')} inputProps={{ min: 1 }} /></FieldCard>
        <FieldCard title={text.time}><ToggleButtonGroup exclusive fullWidth value={draft.timeMode} onChange={set('timeMode')} size="small"><ToggleButton value="direct">{text.direct}</ToggleButton><ToggleButton value="similar">{text.similar}</ToggleButton></ToggleButtonGroup>{draft.timeMode === 'similar' && <FormControl><InputLabel>{text.similarStyle}</InputLabel><Select label={text.similarStyle} value={draft.similarStyleId} onChange={selectSimilar}>{SIMILAR_STYLES.map((style) => <MenuItem key={style.id} value={style.id}>{style.name} · {style.category} · {style.seconds.toLocaleString()} sec</MenuItem>)}</Select></FormControl>}<TextField label={text.seconds} type="number" value={draft.seconds} onChange={set('seconds')} InputProps={{ endAdornment: <InputAdornment position="end">sec</InputAdornment> }} helperText={draft.timeMode === 'similar' ? text.bucketNote : undefined} /></FieldCard>
        <FieldCard title={text.production}><TextField label={text.workers} type="number" value={draft.workers} onChange={set('workers')} /><TextField label={text.hoursDay} type="number" value={draft.hoursDay} onChange={set('hoursDay')} /><TextField label={text.workdays} type="number" value={draft.workdays} onChange={set('workdays')} /><TextField label={text.wage} type="number" value={draft.wage} onChange={set('wage')} InputProps={{ endAdornment: <InputAdornment position="end">₫</InputAdornment> }} /></FieldCard>
        <FieldCard title={text.cost}><TextField label={text.fixed} type="number" value={draft.fixed} onChange={set('fixed')} helperText={text.fixedHint} InputProps={{ endAdornment: <InputAdornment position="end">₫</InputAdornment> }} /><TextField label={text.directCost} type="number" value={draft.directCost} onChange={set('directCost')} helperText={text.directHint} InputProps={{ endAdornment: <InputAdornment position="end">₫</InputAdornment> }} /><TextField label={text.margin} type="number" value={draft.margin} onChange={set('margin')} InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} /></FieldCard>
      </Box>
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, position: { xl: 'sticky' }, top: { xl: 16 } }}><Typography variant="h6" fontWeight={800}>{text.estimate}</Typography><Typography variant="caption" color="text.secondary">{draft.styleName || '-'} · {result.qty.toLocaleString()} pcs</Typography><Divider sx={{ my: 2 }} /><Stack spacing={1.25}><Metric label={text.laborTime} value={`${(result.laborSeconds / 3600).toFixed(1)} h`} /><Metric label={text.duration} value={`${result.durationDays.toFixed(1)} ${text.days}`} /><Metric label={text.completion} value={`D+${Math.ceil(result.durationDays)}`} /><Divider /><Metric label={text.materialCost} value={money(result.direct, languageCode)} /><Metric label={text.laborCost} value={money(result.labor, languageCode)} /><Metric label={text.fixedCost} value={money(result.fixed, languageCode)} /><Metric label={text.totalCost} value={money(result.total, languageCode)} strong /><Metric label={text.unitCost} value={money(result.unitCost, languageCode)} /><Divider /><Metric label={text.recommended} value={money(result.unitPrice, languageCode)} strong /><Metric label={text.revenue} value={money(result.revenue, languageCode)} /><Metric label={text.profit} value={money(result.profit, languageCode)} strong /></Stack><Alert severity="warning" sx={{ mt: 2 }}>{text.assumption}</Alert></Paper>
    </Box>
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}><Box sx={{ p: 2.5 }}><Typography variant="h6" fontWeight={800}>{text.compare}</Typography></Box><TableContainer><Table size="small"><TableHead><TableRow><TableCell>{text.q}</TableCell><TableCell align="right">{text.days}</TableCell><TableCell align="right">{text.costPer}</TableCell><TableCell align="right">{text.pricePer}</TableCell><TableCell align="right">{text.totalProfit}</TableCell></TableRow></TableHead><TableBody>{comparisons.map((row) => <TableRow key={row.qty}><TableCell>{row.qty.toLocaleString()}</TableCell><TableCell align="right">{row.durationDays.toFixed(1)}</TableCell><TableCell align="right">{money(row.unitCost, languageCode)}</TableCell><TableCell align="right">{money(row.unitPrice, languageCode)}</TableCell><TableCell align="right">{money(row.profit, languageCode)}</TableCell></TableRow>)}</TableBody></Table></TableContainer></Paper>
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}><Typography variant="h6" fontWeight={800} gutterBottom>{text.monthly}</Typography><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}><Metric label={text.monthlyQty} value={`${monthlyQty.toLocaleString()} pcs`} strong /><Metric label={text.monthlyRevenue} value={money(monthly.revenue, languageCode)} strong /><Metric label={text.monthlyProfit} value={money(monthly.profit, languageCode)} strong /></Box></Paper>
    <Alert severity="warning">{text.disclaimer}</Alert>
  </Stack></AppPageContainer>;
};

export default RevenueForecast;
