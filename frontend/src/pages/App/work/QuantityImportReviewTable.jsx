import React from 'react';
import { Checkbox, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';

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

export default function QuantityImportReviewTable({ rows, items, approvedKeys, onToggle, disabled, languageCode }) {
  const text = LABELS[languageCode] || LABELS.en;
  const fmt = value => Number(value || 0).toLocaleString();
  const difference = value => value === 0 ? text.equal : `${fmt(Math.abs(value))}${value > 0 ? text.excess : text.shortage}`;
  const historyCell = (quantity, history) => <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="baseline" sx={{ whiteSpace: 'nowrap' }}>
    <Typography component="span" sx={{ fontSize: 12, fontWeight: 600 }}>{fmt(quantity)}</Typography>
    {summarizeProductionMonths(history).map(item => <Typography component="span" key={item.month} color="text.secondary" sx={{ fontSize: 10 }}>{item.month || '—'}: {fmt(item.quantity)}</Typography>)}
  </Stack>;
  return <Stack spacing={1}>{groupQuantityComparison(rows).map(group => <Paper key={group.key} variant="outlined" sx={{ overflow: 'hidden' }}>
    <Stack spacing={0.25} sx={{ px: 1, py: 0.75 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{group.orderNumber} / {group.styleName}</Typography>
      <Typography sx={{ fontSize: 11 }} color="text.secondary">{group.finishedQuantity == null ? (group.hasRequired ? text.unknown : text.partial) : `${text.finished}: ${fmt(group.finishedQuantity)} / ${fmt(group.orderQuantity)} — ${difference(group.finishedQuantity - group.orderQuantity)}`}</Typography>
      {group.finishedQuantity != null ? <Typography variant="caption" color="text.secondary">{text.basis}</Typography> : null}
    </Stack>
    <TableContainer><Table size="small" sx={{ minWidth: 850, '& th, & td': { px: 1, py: 0.5, fontSize: 12, lineHeight: 1.4 }, '& th': { whiteSpace: 'nowrap' }, '& .MuiCheckbox-root': { p: 0.25 }, '& .MuiSvgIcon-root': { fontSize: 18 } }}>
      <TableHead><TableRow>{['process', 'scope', 'target', 'previous', 'incoming', 'total', 'difference', 'approve'].map((key, index) => <TableCell key={key} align={index >= 2 && index <= 5 ? 'right' : 'left'}>{text[key]}</TableCell>)}</TableRow></TableHead>
      <TableBody>{group.rows.map(row => {
        const review = items.find(item => item.styleProcessId === row.styleProcessId && item.orderId === row.orderId && item.styleId === row.styleId);
        return <TableRow key={row.styleProcessId} sx={{ bgcolor: row.difference > 0 ? '#fff8e1' : undefined }}>
          <TableCell>{row.processCode} · {row.processName}</TableCell>
          <TableCell>{({ UNISEX: text.shared, MALE_ONLY: text.male, FEMALE_ONLY: text.female })[row.genderScope]}</TableCell>
          <TableCell align="right">{fmt(row.target)}</TableCell>
          <TableCell align="right"><Tooltip title={(row.history || review?.history || []).map(item => `${item.date}: ${item.quantity}`).join(', ')}>{historyCell(row.previous, row.history || review?.history || [])}</Tooltip></TableCell>
          <TableCell align="right"><Tooltip title={(row.incomingHistory || []).map(item => `${item.date}: ${item.quantity}`).join(', ')}>{historyCell(row.incoming, row.incomingHistory || [])}</Tooltip></TableCell>
          <TableCell align="right">{fmt(row.total)}</TableCell>
          <TableCell sx={{ color: row.difference > 0 ? 'warning.dark' : row.difference < 0 ? 'error.main' : 'success.main', whiteSpace: 'nowrap' }}>{difference(row.difference)}</TableCell>
          <TableCell>{review ? <Checkbox size="small" inputProps={{ 'aria-label': `${row.processCode} ${text.approve}` }} disabled={disabled} checked={approvedKeys.includes(review.key)} onChange={event => onToggle(review.key, event.target.checked)} /> : '—'}</TableCell>
        </TableRow>;
      })}</TableBody>
    </Table></TableContainer>
  </Paper>)}</Stack>;
}
