import React from 'react';
import { Box, Button, IconButton, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { getPayTypeLabel } from '../../constants/payType';
import { resolveLocalizedAttributeName } from '../../utils/appLanguage';
import { ui } from '../../theme/ui';

const TYPES = ['GENERAL', 'OUTPUT_FIXED', 'OUTPUT'];
const copy = {
  ko: ['월 지급 단가 합계', '지급 주기가 1개월인 항목의 설정 단가만 합산합니다. 실제 지급액은 계산식과 근무·생산 실적에 따라 달라집니다.', '자동 계산'],
  en: ['Monthly rate total', 'Only configured rates for monthly payment items are included. Actual payments depend on formulas and attendance or production results.', 'Automatic'],
  vi: ['Tổng đơn giá hàng tháng', 'Chỉ cộng đơn giá của các khoản có chu kỳ thanh toán 1 tháng. Số tiền thực nhận phụ thuộc công thức và kết quả chấm công hoặc sản xuất.', 'Tự động'],
};

export default function SalaryRateMatrix({ items, grades, rates, languageCode, currencyCode, t, categories, unitLabel, onEdit, onAdd, onReorder }) {
  const labels = copy[languageCode] || copy.en;
  const name = row => resolveLocalizedAttributeName(row, languageCode);
  const amount = (row, type, grade) => Number(String(rates[`${type}:${grade.id}`]?.[row.id] || '0').replace(/,/g, ''));
  const formatAmount = value => value === 0 ? '—' : value.toLocaleString(languageCode);
  const monthlyItems = items.filter(row => row.payCycle === 'MONTHLY' && row.id !== 'incentiveTotal');
  const units = [...new Set(monthlyItems.map(unitLabel))];
  const sticky = { position: 'sticky', left: 0, zIndex: 1, bgcolor: ui.color.surface, minWidth: 220, borderRight: 1, borderColor: 'divider' };
  return <Paper variant="outlined" sx={{ minWidth: 0 }}>
    <Stack direction="row" alignItems="center" sx={{ p: 2 }}>
      <Typography fontWeight={700}>{t('급여 항목')} · {currencyCode}</Typography>
      <Button startIcon={<AddIcon />} sx={{ ml: 'auto' }} onClick={onAdd}>{t('항목 추가')}</Button>
    </Stack>
    <TableContainer sx={{ overflowX: 'auto' }} data-salary-rate-matrix>
      <DragDropContext onDragEnd={onReorder}>
        <Table size="small" sx={{ minWidth: 220 + TYPES.length * Math.max(grades.length, 1) * 96 }}>
          <TableHead>
            <TableRow><TableCell rowSpan={2} sx={{ ...sticky, zIndex: 2, bgcolor: ui.color.header }}>{t('항목명')}</TableCell>
              {TYPES.map(type => <TableCell key={type} colSpan={Math.max(grades.length, 1)} align="center" sx={{ borderLeft: 1, borderColor: 'divider' }}>{getPayTypeLabel(type, type, languageCode)}</TableCell>)}
            </TableRow>
            <TableRow>{TYPES.flatMap(type => grades.length ? grades.map(grade => <TableCell key={`${type}:${grade.id}`} align="right" sx={{ whiteSpace: 'nowrap' }}>{name(grade)}<Typography variant="caption" display="block" color="text.secondary">{grade.code}</Typography></TableCell>) : <TableCell key={type}>—</TableCell>)}</TableRow>
          </TableHead>
          {Object.entries(categories).map(([category, label]) => <Droppable key={category} droppableId={`salary-items:${category}`}>
            {provided => <TableBody ref={provided.innerRef} {...provided.droppableProps}>
              <TableRow><TableCell colSpan={1 + TYPES.length * Math.max(grades.length, 1)} sx={{ bgcolor: ui.color.header, color: ui.color.muted, fontWeight: 600 }}>{t(label)}</TableCell></TableRow>
              {items.filter(row => row.category === category).map((row, index) => <Draggable key={row.id} draggableId={String(row.id)} index={index} disableInteractiveElementBlocking>
                {drag => <TableRow ref={drag.innerRef} {...drag.draggableProps} hover data-salary-item={row.id}>
                  <TableCell sx={sticky}><Stack direction="row" spacing={0.5} alignItems="center"><IconButton size="small" {...drag.dragHandleProps} aria-label={languageCode === 'ko' ? '순서 변경' : languageCode === 'vi' ? 'Đổi thứ tự' : 'Reorder'} sx={{ color: 'text.disabled', cursor: 'grab' }}><DragIndicatorIcon fontSize="small" /></IconButton><Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" fontWeight={600}>{name(row)}</Typography><Typography variant="caption" color="text.secondary">{unitLabel(row)}</Typography></Box><Tooltip title={t('수정')}><IconButton size="small" onClick={() => onEdit(row)} aria-label={`${name(row)} ${t('수정')}`}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip></Stack>
                  </TableCell>
                  {TYPES.flatMap(type => {
                    const active = (row.payTypes || []).includes(type);
                    return grades.length ? grades.map((grade, index) => <TableCell key={`${type}:${grade.id}`} align="right" sx={{ whiteSpace: 'nowrap', color: active ? 'text.primary' : 'text.disabled', borderLeft: index === 0 ? 1 : 0, borderColor: 'divider' }}>{!active ? '—' : row.id === 'incentiveTotal' ? labels[2] : formatAmount(amount(row, type, grade))}</TableCell>) : <TableCell key={type}>—</TableCell>;
                  })}
                </TableRow>}
              </Draggable>)}
              {provided.placeholder}
            </TableBody>}
          </Droppable>)}
          <TableBody>{units.map(unit => <TableRow key={unit} data-salary-total={unit} sx={{ bgcolor: ui.color.header }}><TableCell sx={{ ...sticky, bgcolor: ui.color.header, fontWeight: 600 }}>{labels[0]}<Typography variant="caption" display="block" color="text.secondary">{unit}</Typography></TableCell>{TYPES.flatMap(type => grades.length ? grades.map(grade => <TableCell key={`${type}:${grade.id}`} align="right" sx={{ fontWeight: 600 }}>{formatAmount(monthlyItems.filter(row => (row.payTypes || []).includes(type) && unitLabel(row) === unit).reduce((sum, row) => sum + amount(row, type, grade), 0))}</TableCell>) : <TableCell key={type}>—</TableCell>)}</TableRow>)}</TableBody>
        </Table>
      </DragDropContext>
    </TableContainer>
    <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 2 }}>{labels[1]}</Typography>
  </Paper>;
}
