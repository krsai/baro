import React from 'react';
import { Box, Button, Chip, IconButton, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { getPayTypeLabel } from '../../constants/payType';
import { resolveLocalizedAttributeName } from '../../utils/appLanguage';

const TYPES = ['GENERAL', 'OUTPUT_FIXED', 'OUTPUT'];
const copy = {
  ko: ['단가 합계', '정산 기간별 설정 단가의 합계입니다. 실제 지급액은 계산식과 근무·생산 실적에 따라 달라집니다.', '자동 계산'],
  en: ['Rate total', 'Totals of configured rates by payment period. Actual payments depend on formulas and attendance or production results.', 'Automatic'],
  vi: ['Tổng đơn giá', 'Tổng đơn giá theo kỳ thanh toán. Số tiền thực nhận phụ thuộc công thức và kết quả chấm công hoặc sản xuất.', 'Tự động'],
};

export default function SalaryRateMatrix({ items, grades, rates, languageCode, currencyCode, t, categories, unitLabel, onEdit, onAdd, onToggle, onReorder }) {
  const labels = copy[languageCode] || copy.en;
  const name = row => resolveLocalizedAttributeName(row, languageCode);
  const amount = (row, type, grade) => Number(String(rates[`${type}:${grade.id}`]?.[row.id] || '0').replace(/,/g, ''));
  const units = [...new Set(items.filter(row => row.id !== 'incentiveTotal').map(unitLabel))];
  const sticky = { position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', minWidth: 210, borderRight: 1, borderColor: 'divider' };
  return <Paper variant="outlined" sx={{ minWidth: 0 }}>
    <Stack direction="row" alignItems="center" sx={{ p: 2 }}>
      <Typography fontWeight={700}>{t('급여 항목')} · {currencyCode}</Typography>
      <Button startIcon={<AddIcon />} sx={{ ml: 'auto' }} onClick={onAdd}>{t('항목 추가')}</Button>
    </Stack>
    <TableContainer sx={{ overflowX: 'auto' }} data-salary-rate-matrix>
      <DragDropContext onDragEnd={onReorder}>
        <Table size="small" sx={{ minWidth: 300 + TYPES.length * Math.max(grades.length, 1) * 90, '& .MuiTableCell-root': { px: 1, fontSize: 12 } }}>
          <TableHead>
            <TableRow><TableCell rowSpan={2} sx={{ ...sticky, zIndex: 2 }}>{t('항목명')}</TableCell>
              {TYPES.map(type => <TableCell key={type} colSpan={Math.max(grades.length, 1)} align="center" sx={{ borderLeft: 1, borderColor: 'divider' }}>{getPayTypeLabel(type, type, languageCode)}</TableCell>)}
              <TableCell rowSpan={2} align="center">{t('수정')}</TableCell>
            </TableRow>
            <TableRow>{TYPES.flatMap(type => grades.length ? grades.map(grade => <TableCell key={`${type}:${grade.id}`} align="right" sx={{ whiteSpace: 'nowrap' }}>{name(grade)}<Typography variant="caption" display="block" color="text.secondary">{grade.code}</Typography></TableCell>) : <TableCell key={type}>—</TableCell>)}</TableRow>
          </TableHead>
          {Object.entries(categories).map(([category, label]) => <Droppable key={category} droppableId={`salary-items:${category}`}>
            {provided => <TableBody ref={provided.innerRef} {...provided.droppableProps}>
              <TableRow><TableCell colSpan={2 + TYPES.length * Math.max(grades.length, 1)} sx={{ bgcolor: 'action.hover', fontWeight: 700 }}>{t(label)}</TableCell></TableRow>
              {items.filter(row => row.category === category).map((row, index) => <Draggable key={row.id} draggableId={String(row.id)} index={index} disableInteractiveElementBlocking>
                {drag => <TableRow ref={drag.innerRef} {...drag.draggableProps} hover data-salary-item={row.id}>
                  <TableCell sx={sticky}><Stack direction="row" alignItems="center"><IconButton size="small" {...drag.dragHandleProps} aria-label={languageCode === 'ko' ? '순서 변경' : languageCode === 'vi' ? 'Đổi thứ tự' : 'Reorder'}><DragIndicatorIcon fontSize="small" /></IconButton><Box><Typography variant="body2" fontWeight={600}>{name(row)}</Typography><Typography variant="caption" color="text.secondary">{unitLabel(row)}</Typography></Box></Stack>
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.75 }}>{TYPES.map(type => <Chip key={type} size="small" label={getPayTypeLabel(type, type, languageCode)} variant={(row.payTypes || []).includes(type) ? 'filled' : 'outlined'} color={(row.payTypes || []).includes(type) ? 'primary' : 'default'} disabled={category === 'INCENTIVE'} onClick={() => onToggle(row, type)} role="button" aria-pressed={(row.payTypes || []).includes(type)} aria-label={`${name(row)} ${getPayTypeLabel(type, type, languageCode)}`} sx={{ fontSize: 10 }} />)}</Stack>
                  </TableCell>
                  {TYPES.flatMap(type => {
                    const active = (row.payTypes || []).includes(type);
                    return grades.length ? grades.map((grade, index) => <TableCell key={`${type}:${grade.id}`} align="right" sx={{ whiteSpace: 'nowrap', color: active ? 'text.primary' : 'text.disabled', borderLeft: index === 0 ? 1 : 0, borderColor: 'divider' }}>{!active ? '—' : row.id === 'incentiveTotal' ? labels[2] : amount(row, type, grade).toLocaleString(languageCode)}</TableCell>) : <TableCell key={type}>—</TableCell>;
                  })}
                  <TableCell><Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => onEdit(row)}>{t('수정')}</Button></TableCell>
                </TableRow>}
              </Draggable>)}
              {provided.placeholder}
            </TableBody>}
          </Droppable>)}
          <TableBody>{units.map(unit => <TableRow key={unit} data-salary-total={unit}><TableCell sx={{ ...sticky, fontWeight: 700 }}>{labels[0]}<Typography variant="caption" display="block">{unit}</Typography></TableCell>{TYPES.flatMap(type => grades.length ? grades.map(grade => <TableCell key={`${type}:${grade.id}`} align="right" sx={{ fontWeight: 700 }}>{items.filter(row => row.id !== 'incentiveTotal' && (row.payTypes || []).includes(type) && unitLabel(row) === unit).reduce((sum, row) => sum + amount(row, type, grade), 0).toLocaleString(languageCode)}</TableCell>) : <TableCell key={type}>—</TableCell>)}<TableCell /></TableRow>)}</TableBody>
        </Table>
      </DragDropContext>
    </TableContainer>
    <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 2 }}>{labels[1]}</Typography>
  </Paper>;
}
