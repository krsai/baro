import React from 'react';
import { Checkbox, FormControlLabel, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';

const LABELS = {
  ko: { process: '공정', scope: '적용 대상', target: '주문량', previous: '기존 생산량', incoming: '이번 입력', total: '누적 생산량', difference: '주문 대비', approve: '이상 없음', excess: '개 초과', shortage: '개 부족', equal: '주문량 일치', finished: '공정 기준 완성 가능 수량', unknown: '완성품 합계는 성별별 공정 구성이 달라 단순 합산하지 않습니다. 공정별 수량을 확인하세요.', shared: '남녀 공용', male: '남성 전용', female: '여성 전용', basis: '필수 공정의 최소 실적 기준이며 실제 완성·검수 수량은 아닙니다.', partial: '전체 필수 공정 연결을 확인할 수 없어 완성 가능 수량을 계산하지 않습니다.' },
  en: { process: 'Process', scope: 'Applies to', target: 'Order qty', previous: 'Previous output', incoming: 'This import', total: 'Total output', difference: 'vs order', approve: 'No issue', excess: ' excess', shortage: ' short', equal: 'Matches order', finished: 'Potential finished quantity from processes', unknown: 'Gender-specific processes have different targets. Review quantities per process.', shared: 'Shared', male: 'Male only', female: 'Female only', basis: 'Based on the lowest required-process output; not actual finished or inspected goods.', partial: 'Required process links are incomplete; potential finished quantity is unavailable.' },
  vi: { process: 'Công đoạn', scope: 'Áp dụng', target: 'SL đơn hàng', previous: 'Đã sản xuất', incoming: 'Nhập lần này', total: 'Tổng sản lượng', difference: 'So với đơn hàng', approve: 'Không có vấn đề', excess: ' dư', shortage: ' thiếu', equal: 'Khớp đơn hàng', finished: 'SL có thể hoàn thành theo công đoạn', unknown: 'Công đoạn riêng nam/nữ có mục tiêu khác nhau. Vui lòng kiểm tra từng công đoạn.', shared: 'Nam/nữ dùng chung', male: 'Chỉ nam', female: 'Chỉ nữ', basis: 'Dựa trên sản lượng thấp nhất của công đoạn bắt buộc; không phải thành phẩm đã kiểm tra.', partial: 'Thiếu liên kết công đoạn bắt buộc; chưa thể tính số lượng hoàn thành.' },
};

export const groupQuantityComparison = (rows) => {
  const groups = new Map();
  rows.forEach(row => {
    const key = `${row.orderId}:${row.styleId}`;
    if (!groups.has(key)) groups.set(key, { ...row, key, rows: [] });
    groups.get(key).rows.push(row);
  });
  return [...groups.values()].map(group => {
    const required = group.rows.filter(row => row.required && row.target > 0);
    const complete = group.rows.every(row => row.requiredSetComplete);
    const shared = required.length > 0 && required.every(row => row.genderScope === 'UNISEX');
    return { ...group, finishedQuantity: shared && complete ? Math.min(...required.map(row => row.total)) : null, hasRequired: required.length > 0 && complete };
  });
};

export const summarizeProductionMonths = (history = []) => {
  const months = new Map();
  history.forEach(row => {
    const month = /^\d{4}-\d{2}/.test(String(row.date || '')) ? String(row.date).slice(0, 7) : '';
    months.set(month, (months.get(month) || 0) + (Number(row.quantity) || 0));
  });
  return [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, quantity]) => ({ month, quantity }));
};

// Estimate complete sets, prioritizing the ordered male/female quantities.
// Shared process counts constrain the combined total, never each gender alone.
export const estimateProductionSets = (group) => {
  const required = group.rows.filter(row => row.required && row.target > 0);
  if (!required.length || !group.rows.every(row => row.requiredSetComplete) ||
      group.orderUnspecifiedQuantity > 0 || !Number.isFinite(group.orderMaleQuantity) || !Number.isFinite(group.orderFemaleQuantity)) return null;
  if (required.some(row => !['UNISEX', 'MALE_ONLY', 'FEMALE_ONLY'].includes(row.genderScope))) return null;
  const minimum = scope => {
    const values = required.filter(row => row.genderScope === scope).map(row => Math.max(0, Number(row.total) || 0));
    return values.length ? Math.min(...values) : Infinity;
  };
  const shared = minimum('UNISEX');
  const maleCapacity = group.orderMaleQuantity > 0 ? Math.min(shared, minimum('MALE_ONLY')) : 0;
  const femaleCapacity = group.orderFemaleQuantity > 0 ? Math.min(shared, minimum('FEMALE_ONLY')) : 0;
  const unisexCapacity = group.orderUnisexQuantity > 0 ? shared : 0;
  const capacities = [maleCapacity, femaleCapacity, unisexCapacity];
  const total = Math.min(shared, maleCapacity + femaleCapacity + unisexCapacity);
  if (!Number.isFinite(total)) return null;
  let bases = [Math.min(group.orderMaleQuantity, maleCapacity), Math.min(group.orderFemaleQuantity, femaleCapacity), Math.min(group.orderUnisexQuantity || 0, unisexCapacity)];
  if (bases.reduce((sum, value) => sum + value, 0) > total) bases = [0, 0, 0];
  const ranges = capacities.map((capacity, index) => ({
    min: Math.max(bases[index], total - capacities.filter((_, i) => i !== index).reduce((sum, value) => sum + value, 0)),
    max: Math.min(capacity, total - bases.filter((_, i) => i !== index).reduce((sum, value) => sum + value, 0)),
  }));
  const [maleMin, maleMax, femaleMin, femaleMax, unisexMin, unisexMax] = ranges.flatMap(range => [range.min, range.max]);
  const remnants = group.rows.map(row => {
    const usedMin = row.genderScope === 'UNISEX' ? total : row.genderScope === 'MALE_ONLY' ? maleMin : femaleMin;
    const usedMax = row.genderScope === 'UNISEX' ? total : row.genderScope === 'MALE_ONLY' ? maleMax : femaleMax;
    return { styleProcessId: row.styleProcessId, min: Math.max(0, row.total - usedMax), max: Math.max(0, row.total - usedMin) };
  });
  return { total, maleMin, maleMax, femaleMin, femaleMax, unisexMin, unisexMax, remnants, hasRemnants: remnants.some(row => row.max > 0) };
};

export default function QuantityImportReviewTable({ rows, items, approvedKeys, onToggle, onToggleAll, disabled, languageCode }) {
  const text = LABELS[languageCode] || LABELS.en;
  const fmt = value => Number(value || 0).toLocaleString();
  const difference = value => value === 0 ? text.equal : `${fmt(Math.abs(value))}${value > 0 ? text.excess : text.shortage}`;
  const historyCell = (quantity, history) => <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="baseline" sx={{ whiteSpace: 'nowrap' }}>
    <Typography component="span" sx={{ fontSize: 12, fontWeight: 600 }}>{fmt(quantity)}</Typography>
    {summarizeProductionMonths(history).map(item => <Typography component="span" key={item.month} color="text.secondary" sx={{ fontSize: 10 }}>{item.month || '—'}: {fmt(item.quantity)}</Typography>)}
  </Stack>;
  const approvedCount = items.filter(item => approvedKeys.includes(item.key)).length;
  const allApproved = items.length > 0 && approvedCount === items.length;
  const estimateText = languageCode === 'ko' ? { title: '예상 완성', total: '합계', remnants: '잔여 공정 수량', none: '없음', exists: '있음', basis: '주문량 우선 충족 기준의 예상입니다. 실제 완성·검수 수량은 아닙니다. 잔여는 완성 세트에 포함되지 않은 공정 실적이며 폐기를 뜻하지 않습니다.' } : languageCode === 'vi' ? { title: 'Dự kiến hoàn thành', total: 'Tổng', remnants: 'SL công đoạn còn lại', none: 'Không có', exists: 'Có', basis: 'Ước tính ưu tiên đáp ứng đơn hàng; không phải số lượng đã kiểm tra. Phần dư công đoạn không đồng nghĩa với phế phẩm.' } : { title: 'Estimated finished sets', total: 'Total', remnants: 'Unmatched process quantity', none: 'None', exists: 'Present', basis: 'Estimate prioritizing ordered quantities, not inspected finished goods. Unmatched process output does not mean scrap.' };
  const range = (min, max) => min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
  const unisexLabel = languageCode === 'ko' ? '유니섹스' : 'Unisex';
  const genderText = languageCode === 'ko' ? { male: '남성복', female: '여성복', other: '성별 미지정', total: '주문 합계', shared: '공용 공정 초과·부족은 남녀 합계 기준입니다. 작업기록에 성별 구분이 없어 초과분을 남성복/여성복으로 나눌 수 없습니다.', all: '일괄 이상 없음' } : languageCode === 'vi' ? { male: 'Nam', female: 'Nữ', other: 'Chưa xác định', total: 'Tổng đơn hàng', shared: 'Công đoạn dùng chung tính tổng nam/nữ. Ghi chép không có giới tính nên không thể chia phần dư theo nam/nữ.', all: 'Tất cả không có vấn đề' } : { male: 'Male', female: 'Female', unisex: 'Unisex', other: 'Unspecified', total: 'Order total', shared: 'Shared-process differences use the combined target. Work records do not specify gender, so excess cannot be allocated to male/female.', all: 'Mark all as no issue' };
  return <Stack spacing={1}>
    <FormControlLabel sx={{ m: 0, '& .MuiTypography-root': { fontSize: 12 }, '& .MuiCheckbox-root': { p: 0.5 } }} label={`${genderText.all} (${approvedCount}/${items.length})`} control={<Checkbox size="small" disabled={disabled || !items.length} checked={allApproved} indeterminate={approvedCount > 0 && !allApproved} onChange={event => onToggleAll(event.target.checked)} />} />
    {groupQuantityComparison(rows).map(group => {
      const estimate = estimateProductionSets(group);
      return <Paper key={group.key} variant="outlined" sx={{ overflow: 'hidden' }}>
    <Stack spacing={0.25} sx={{ px: 1, py: 0.75 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{group.orderNumber} / {group.styleName}</Typography>
      <Typography sx={{ fontSize: 11 }}>{genderText.male} {fmt(group.orderMaleQuantity)} + {genderText.female} {fmt(group.orderFemaleQuantity)}{group.orderUnisexQuantity > 0 ? ` + ${unisexLabel} ${fmt(group.orderUnisexQuantity)}` : ''}{group.orderUnspecifiedQuantity > 0 ? ` + ${genderText.other} ${fmt(group.orderUnspecifiedQuantity)}` : ''} = {genderText.total} {fmt(group.orderQuantity)}</Typography>
      {estimate ? <>
        <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{estimateText.title}: {genderText.male} {range(estimate.maleMin, estimate.maleMax)}{estimate.maleMin === estimate.maleMax ? ` (${difference(estimate.maleMin - group.orderMaleQuantity)})` : ''} + {genderText.female} {range(estimate.femaleMin, estimate.femaleMax)}{estimate.femaleMin === estimate.femaleMax ? ` (${difference(estimate.femaleMin - group.orderFemaleQuantity)})` : ''}{group.orderUnisexQuantity > 0 ? ` + ${unisexLabel} ${range(estimate.unisexMin, estimate.unisexMax)}${estimate.unisexMin === estimate.unisexMax ? ` (${difference(estimate.unisexMin - group.orderUnisexQuantity)})` : ''}` : ''} / {estimateText.total} {fmt(estimate.total)} ({difference(estimate.total - group.orderQuantity)}) / {estimateText.remnants}: {estimate.hasRemnants ? estimateText.exists : estimateText.none}</Typography>
        <Typography sx={{ fontSize: 10 }} color="text.secondary">{estimateText.basis}</Typography>
      </> : <Typography sx={{ fontSize: 11 }} color="text.secondary">{text.partial}</Typography>}
    </Stack>
    <TableContainer><Table size="small" sx={{ minWidth: 850, '& th, & td': { px: 1, py: 0.5, fontSize: 12, lineHeight: 1.4 }, '& th': { whiteSpace: 'nowrap' }, '& .MuiCheckbox-root': { p: 0.25 }, '& .MuiSvgIcon-root': { fontSize: 18 } }}>
      <TableHead><TableRow>{['process', 'scope', 'target', 'previous', 'incoming', 'total', 'difference', 'remnants', 'approve'].map((key, index) => <TableCell key={key} align={index >= 2 && index <= 5 ? 'right' : 'left'}>{key === 'remnants' ? estimateText.remnants : text[key]}</TableCell>)}</TableRow></TableHead>
      <TableBody>{group.rows.map(row => {
        const review = items.find(item => item.styleProcessId === row.styleProcessId && item.orderId === row.orderId && item.styleId === row.styleId);
        const remnant = estimate?.remnants.find(item => item.styleProcessId === row.styleProcessId);
        return <TableRow key={row.styleProcessId} sx={{ bgcolor: row.difference > 0 ? '#fff8e1' : undefined }}>
          <TableCell>{row.processCode} · {row.processName}</TableCell>
          <TableCell>{({ UNISEX: text.shared, MALE_ONLY: text.male, FEMALE_ONLY: text.female })[row.genderScope]}</TableCell>
          <TableCell align="right">{fmt(row.target)}</TableCell>
          <TableCell align="right"><Tooltip title={(row.history || review?.history || []).map(item => `${item.date}: ${item.quantity}`).join(', ')}>{historyCell(row.previous, row.history || review?.history || [])}</Tooltip></TableCell>
          <TableCell align="right"><Tooltip title={(row.incomingHistory || []).map(item => `${item.date}: ${item.quantity}`).join(', ')}>{historyCell(row.incoming, row.incomingHistory || [])}</Tooltip></TableCell>
          <TableCell align="right">{fmt(row.total)}</TableCell>
          <TableCell sx={{ color: row.difference > 0 ? 'warning.dark' : row.difference < 0 ? 'error.main' : 'success.main', whiteSpace: 'nowrap' }}>{row.difference !== 0 ? `${({ UNISEX: text.shared, MALE_ONLY: genderText.male, FEMALE_ONLY: genderText.female })[row.genderScope]} ` : ''}{difference(row.difference)}</TableCell>
          <TableCell sx={{ color: remnant?.max > 0 ? 'warning.dark' : 'text.secondary', whiteSpace: 'nowrap' }}>{remnant ? range(remnant.min, remnant.max) : '—'}</TableCell>
          <TableCell>{review ? <Checkbox size="small" inputProps={{ 'aria-label': `${row.processCode} ${text.approve}` }} disabled={disabled} checked={approvedKeys.includes(review.key)} onChange={event => onToggle(review.key, event.target.checked)} /> : '—'}</TableCell>
        </TableRow>;
      })}</TableBody>
    </Table></TableContainer>
  </Paper>; })}</Stack>;
}
