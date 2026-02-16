import React, { useEffect, useMemo, useRef } from 'react';
import { Box, IconButton, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchableSelect from '../../../components/SearchableSelect';
import { formatNumberWithCommas } from '../../../utils/numberFormat';

const toSeconds = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed > 0 ? Math.round(parsed) : 0;
};

const resolveCtSeconds = (process) => {
  if (!process) return 0;
  return toSeconds(process.ctSeconds ?? process.contractedSeconds ?? process.at ?? process.pt);
};

const buildProcessOptions = (style) => {
  const rows = Array.isArray(style?.processes) ? style.processes : [];
  return rows.map((process, index) => ({
    id: process.instanceId || process.id || `${style?.id || 'style'}-proc-${index}`,
    code: process.code || '',
    name: process.name || `공정 ${index + 1}`,
    pt: process.pt,
    at: process.at,
    ctSeconds: resolveCtSeconds(process),
  }));
};
const normalizeKeyPart = (value) => String(value ?? '').trim().toLowerCase();
const resolveCustomerKey = (customer) => normalizeKeyPart(customer?.id ?? customer?.name);
const resolveStyleKey = (style) => normalizeKeyPart(style?.id ?? style?.name);
const resolveColorKey = (color) => normalizeKeyPart(color?.id ?? color?.code ?? color?.name);
const resolveProcessKey = (process) =>
  normalizeKeyPart(process?.code ?? process?.name ?? process?.id);

const calculateWage = (item, factory) => {
  const quantity = Number(item?.quantity) || 0;
  if (!item?.process || quantity <= 0 || !factory) {
    return { ctSeconds: 0, wagePerPiece: 0, totalWage: 0 };
  }

  const ctSeconds = resolveCtSeconds(item.process);
  const wagePerSecond = Number(factory.wagePerSecond) || 0;
  const wagePerPiece = ctSeconds * wagePerSecond;
  const totalWage = wagePerPiece * quantity;

  return {
    ctSeconds,
    wagePerPiece,
    totalWage,
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
  customers,
  styles,
  colors = [],
  allItems = [],
  factory,
}) => {
  const customerInputRef = useRef(null);
  const styleInputRef = useRef(null);
  const processInputRef = useRef(null);
  const colorInputRef = useRef(null);
  const quantityInputRef = useRef(null);

  const filteredStyles = useMemo(
    () =>
      item.customer
        ? styles.filter((style) => style.customer === item.customer.name)
        : [],
    [item.customer, styles]
  );

  const processOptions = useMemo(() => buildProcessOptions(item.style), [item.style]);
  const selectedCustomerKey = resolveCustomerKey(item.customer);
  const selectedStyleKey = resolveStyleKey(item.style);
  const selectedColorKey = resolveColorKey(item.color);
  const selectedProcessKey = resolveProcessKey(item.process);
  const takenProcessKeySet = useMemo(() => {
    if (!selectedCustomerKey || !selectedStyleKey || !selectedColorKey) return new Set();

    const taken = new Set();
    allItems.forEach((entry) => {
      if (!entry || entry.id === item.id) return;
      if (resolveCustomerKey(entry.customer) !== selectedCustomerKey) return;
      if (resolveStyleKey(entry.style) !== selectedStyleKey) return;
      if (resolveColorKey(entry.color) !== selectedColorKey) return;
      const processKey = resolveProcessKey(entry.process);
      if (processKey) taken.add(processKey);
    });
    return taken;
  }, [allItems, item.id, selectedColorKey, selectedCustomerKey, selectedStyleKey]);
  const isProcessOptionDisabled = (option) => takenProcessKeySet.has(resolveProcessKey(option));
  const takenColorKeySet = useMemo(() => {
    if (!selectedCustomerKey || !selectedStyleKey || !selectedProcessKey) return new Set();

    const taken = new Set();
    allItems.forEach((entry) => {
      if (!entry || entry.id === item.id) return;
      if (resolveCustomerKey(entry.customer) !== selectedCustomerKey) return;
      if (resolveStyleKey(entry.style) !== selectedStyleKey) return;
      if (resolveProcessKey(entry.process) !== selectedProcessKey) return;
      const colorKey = resolveColorKey(entry.color);
      if (colorKey) taken.add(colorKey);
    });
    return taken;
  }, [allItems, item.id, selectedCustomerKey, selectedProcessKey, selectedStyleKey]);
  const isColorOptionDisabled = (option) => takenColorKeySet.has(resolveColorKey(option));
  const wageInfo = calculateWage(item, factory);
  const canMoveToNextItem = !disabled && Boolean(item.process) && Number(item.quantity) > 0;

  useEffect(() => {
    if (!focusRequest?.token || focusRequest.itemId !== item.id) return;

    const focusMap = {
      customer: customerInputRef.current,
      style: styleInputRef.current,
      process: processInputRef.current,
      color: colorInputRef.current,
      quantity: quantityInputRef.current,
    };

    requestAnimationFrame(() => {
      const target = focusMap[focusRequest.field] || customerInputRef.current;
      target?.focus();
    });
  }, [focusRequest?.token, focusRequest?.itemId, focusRequest?.field, item.id]);

  return (
    <Box
      sx={{
        mb: 1,
        p: 1,
        border: '1px solid',
        borderColor: 'divider',
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
        <SearchableSelect
          label="고객사"
          options={customers}
          value={item.customer}
          onChange={(_event, value) => onItemChange('customer', value)}
          disabled={disabled}
          isOptionEqualToValue={(option, value) => option?.id === value?.id}
          textFieldProps={{
            size: 'small',
            placeholder: '고객사 선택',
            inputRef: customerInputRef,
          }}
        />

        <SearchableSelect
          label="스타일"
          options={filteredStyles}
          value={item.style}
          onChange={(_event, value) => onItemChange('style', value)}
          disabled={disabled || !item.customer}
          getOptionLabel={(option) => option?.name || ''}
          isOptionEqualToValue={(option, value) => option?.id === value?.id}
          textFieldProps={{
            size: 'small',
            placeholder: '스타일 선택',
            inputRef: styleInputRef,
          }}
        />

        <SearchableSelect
          label="색상"
          options={colors}
          value={item.color}
          onChange={(_event, value) => onItemChange('color', value)}
          disabled={disabled || !item.style}
          getOptionLabel={(option) => option?.name || option?.code || ''}
          isOptionEqualToValue={(option, value) =>
            option?.id === value?.id ||
            String(option?.code || '') === String(value?.code || '') ||
            String(option?.name || '') === String(value?.name || '')
          }
          getOptionDisabled={isColorOptionDisabled}
          textFieldProps={{
            size: 'small',
            placeholder: '색상 선택',
            inputRef: colorInputRef,
          }}
        />

        <SearchableSelect
          label="공정"
          options={processOptions}
          value={item.process}
          onChange={(_event, value) => onItemChange('process', value)}
          disabled={disabled || !item.style || !item.color}
          getOptionLabel={(option) => `[${option?.code || '-'}] ${option?.name || ''}`}
          isOptionEqualToValue={(option, value) => option?.id === value?.id}
          getOptionDisabled={isProcessOptionDisabled}
          textFieldProps={{
            size: 'small',
            placeholder: '공정 선택',
            inputRef: processInputRef,
          }}
        />

        <TextField
          label="수량"
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
            item.process
              ? `${formatNumberWithCommas(wageInfo.wagePerPiece, {
                  fallback: '0',
                  maximumFractionDigits: 2,
                })} 원`
              : '-'
          }
          InputProps={{ readOnly: true }}
          inputProps={{ tabIndex: -1 }}
          sx={{ '& .MuiInputBase-root': { backgroundColor: '#f8fafc' } }}
          fullWidth
        />

        <TextField
          label="총 공임"
          size="small"
          value={
            item.quantity
              ? `${formatNumberWithCommas(wageInfo.totalWage, {
                  fallback: '0',
                  maximumFractionDigits: 2,
                })} 원`
              : '-'
          }
          InputProps={{ readOnly: true }}
          inputProps={{ tabIndex: -1 }}
          sx={{ '& .MuiInputBase-root': { backgroundColor: '#f8fafc' } }}
          fullWidth
        />
      </Box>
    </Box>
  );
};

export default WorkItemRow;
