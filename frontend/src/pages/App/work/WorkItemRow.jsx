import React, { useEffect, useRef } from 'react';
import { Box, IconButton, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchableSelect from '../../../components/SearchableSelect';
import { formatNumberWithCommas } from '../../../utils/numberFormat';

const toSeconds = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed > 0 ? Math.round(parsed) : 0;
};

const resolveFirstPositiveSeconds = (...values) => {
  for (const value of values) {
    const seconds = toSeconds(value);
    if (seconds > 0) return seconds;
  }
  return 0;
};

const resolveCtSeconds = (process) => {
  if (!process) return 0;
  return resolveFirstPositiveSeconds(
    process.ctSeconds,
    process.contractedSeconds,
    process.at,
    process.pt
  );
};

const isAgreedAssignmentPlan = (plan) =>
  String(plan?.ctStatus || '').trim().toUpperCase() === 'AGREED';

const formatTextFieldValue = (value) => {
  const text = String(value || '').trim();
  return text || '-';
};

const formatProcessLabel = (process) => {
  if (!process) return '-';
  const code = String(process?.code || '').trim();
  const name = String(process?.name || '').trim();
  if (code && name) return `[${code}] ${name}`;
  return code || name || '-';
};

const formatCardOptionLabel = (option) => {
  const customer = String(option?.customer || '').trim() || '고객사 미지정';
  const orderNo = String(option?.orderNo || '-').trim() || '-';
  const styleLabel = String(option?.label || '').trim() || '스타일 미지정';
  const colorName = String(option?.colorName || '').trim() || '색상 미지정';
  const quantityText =
    option?.quantity != null
      ? ` · 배정 ${formatNumberWithCommas(option.quantity, {
          fallback: '0',
          maximumFractionDigits: 0,
        })}`
      : '';
  const statusText = isAgreedAssignmentPlan(option) ? 'CT 동의' : 'CT 미동의';
  return `${customer} · [${orderNo}] · ${styleLabel} · ${colorName}${quantityText} · ${statusText}`;
};

const calculateWage = (item, factory) => {
  const quantity = Number(item?.quantity) || 0;
  if (!item?.process || quantity <= 0 || !factory) {
    return { ctSeconds: 0, wagePerPiece: 0, totalWage: 0, hasValidWage: true };
  }

  const ctSeconds = resolveCtSeconds(item.process);
  const wagePerSecond = Number(factory.wagePerSecond);
  if (!Number.isFinite(wagePerSecond) || wagePerSecond <= 0) {
    return { ctSeconds, wagePerPiece: 0, totalWage: 0, hasValidWage: false };
  }
  const wagePerPiece = ctSeconds * wagePerSecond;
  const totalWage = wagePerPiece * quantity;

  return {
    ctSeconds,
    wagePerPiece,
    totalWage,
    hasValidWage: true,
  };
};

const WorkItemRow = ({
  item,
  itemIndex,
  disabled,
  focusRequest,
  onItemChange,
  onRemoveItem,
  onRequestAddItem,
  onRequestActionFocus,
  factory,
  assignmentPlans = [],
}) => {
  const cardInputRef = useRef(null);
  const quantityInputRef = useRef(null);

  const wageInfo = calculateWage(item, factory);
  const canMoveToNextItem = !disabled && Boolean(item.process) && Number(item.quantity) > 0;

  useEffect(() => {
    if (!focusRequest?.token || focusRequest.itemId !== item.id) return;

    const focusMap = {
      card: cardInputRef.current,
      quantity: quantityInputRef.current,
    };

    requestAnimationFrame(() => {
      const target = focusMap[focusRequest.field] || cardInputRef.current;
      target?.focus();
    });
  }, [focusRequest?.token, focusRequest?.itemId, focusRequest?.field, item.id]);

  const hasCard = Boolean(item.card);

  return (
    <Box
      sx={{
        mb: 1,
        p: 1,
        border: '1px solid',
        borderColor: hasCard ? 'primary.light' : 'divider',
        borderRadius: 1.5,
        backgroundColor: disabled ? '#fafafa' : '#fff',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
          항목 {itemIndex}
        </Typography>
        <IconButton onClick={onRemoveItem} color="error" tabIndex={-1} size="small" disabled={disabled}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ mb: 1 }}>
        <SearchableSelect
          label="배정 카드 (CT 동의)"
          options={assignmentPlans}
          value={item.card || null}
          onChange={(_event, value) => onItemChange('card', value)}
          disabled={disabled || assignmentPlans.length === 0}
          getOptionLabel={formatCardOptionLabel}
          isOptionEqualToValue={(option, value) => option?.dbId === value?.dbId}
          getOptionDisabled={(option) => !isAgreedAssignmentPlan(option)}
          textFieldProps={{
            size: 'small',
            placeholder:
              assignmentPlans.length === 0
                ? '선택 가능한 배정 카드가 없습니다.'
                : 'CT 동의된 카드를 선택하면 고객사/스타일/색상/공정이 자동 입력됩니다.',
            inputRef: cardInputRef,
          }}
        />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 1,
          gridTemplateColumns: {
            xs: '1fr',
            md: 'minmax(140px, 1.05fr) minmax(160px, 1.1fr) minmax(130px, 1fr) minmax(220px, 1.4fr) 90px 110px 140px 160px',
          },
        }}
      >
        <TextField
          label="고객사"
          size="small"
          value={formatTextFieldValue(item.customer?.name)}
          InputProps={{ readOnly: true }}
          inputProps={{ tabIndex: -1 }}
          sx={{ '& .MuiInputBase-root': { backgroundColor: '#f8fafc' } }}
          fullWidth
        />

        <TextField
          label="스타일"
          size="small"
          value={formatTextFieldValue(item.style?.name)}
          InputProps={{ readOnly: true }}
          inputProps={{ tabIndex: -1 }}
          sx={{ '& .MuiInputBase-root': { backgroundColor: '#f8fafc' } }}
          fullWidth
        />

        <TextField
          label="색상"
          size="small"
          value={formatTextFieldValue(item.color?.name || item.color?.code)}
          InputProps={{ readOnly: true }}
          inputProps={{ tabIndex: -1 }}
          sx={{ '& .MuiInputBase-root': { backgroundColor: '#f8fafc' } }}
          fullWidth
        />

        <TextField
          label="공정"
          size="small"
          value={formatProcessLabel(item.process)}
          InputProps={{ readOnly: true }}
          inputProps={{ tabIndex: -1 }}
          sx={{ '& .MuiInputBase-root': { backgroundColor: '#f8fafc' } }}
          fullWidth
        />

        <TextField
          label="실생산량"
          type="number"
          size="small"
          value={item.quantity}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === '') {
              onItemChange('quantity', '');
              return;
            }
            const parsed = Number.parseInt(raw, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
              onItemChange('quantity', parsed);
            }
          }}
          onKeyDown={(event) => {
            if (['-', '+', 'e', 'E', '.'].includes(event.key)) {
              event.preventDefault();
              return;
            }

            if (event.key === 'Enter' && !event.nativeEvent.isComposing && canMoveToNextItem) {
              event.preventDefault();
              onRequestAddItem?.();
              return;
            }

            if (
              event.key === 'Tab' &&
              !event.shiftKey &&
              !event.ctrlKey &&
              !event.altKey &&
              !event.metaKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              onRequestActionFocus?.();
            }
          }}
          disabled={disabled || !item.process}
          inputRef={quantityInputRef}
          inputProps={{ min: 1 }}
          fullWidth
        />

        <TextField
          label="CT(초/개)"
          size="small"
          value={
            item.process
              ? formatNumberWithCommas(wageInfo.ctSeconds, {
                  fallback: '0',
                  maximumFractionDigits: 0,
                })
              : '-'
          }
          InputProps={{ readOnly: true }}
          inputProps={{ tabIndex: -1 }}
          sx={{ '& .MuiInputBase-root': { backgroundColor: '#f8fafc' } }}
          fullWidth
        />

        <TextField
          label="공임(개당)"
          size="small"
          value={
            item.process && wageInfo.hasValidWage
              ? `${formatNumberWithCommas(wageInfo.wagePerPiece, {
                  fallback: '0',
                  maximumFractionDigits: 2,
                })} 동`
              : item.process
                ? '공임 미설정'
                : '-'
          }
          InputProps={{ readOnly: true }}
          inputProps={{ tabIndex: -1 }}
          sx={{
            '& .MuiInputBase-root': { backgroundColor: '#f8fafc' },
            ...(item.process && !wageInfo.hasValidWage
              ? { '& .MuiInputBase-input': { color: 'warning.main', fontWeight: 700 } }
              : {}),
          }}
          fullWidth
        />

        <TextField
          label="총 공임"
          size="small"
          value={
            item.quantity && wageInfo.hasValidWage
              ? `${formatNumberWithCommas(wageInfo.totalWage, {
                  fallback: '0',
                  maximumFractionDigits: 2,
                })} 동`
              : item.quantity
                ? '공임 미설정'
                : '-'
          }
          InputProps={{ readOnly: true }}
          inputProps={{ tabIndex: -1 }}
          sx={{
            '& .MuiInputBase-root': { backgroundColor: '#f8fafc' },
            ...(item.quantity && !wageInfo.hasValidWage
              ? { '& .MuiInputBase-input': { color: 'warning.main', fontWeight: 700 } }
              : {}),
          }}
          fullWidth
        />
      </Box>
    </Box>
  );
};

export default WorkItemRow;
