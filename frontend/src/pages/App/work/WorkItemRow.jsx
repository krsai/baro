import React, { useEffect, useMemo, useRef } from 'react';
import { Box, IconButton, TextField } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchableSelect from '../../../components/SearchableSelect';

const toSeconds = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed > 0 ? Math.round(parsed) : 0;
};

const resolveCtSeconds = (process) => {
  if (!process) return 0;
  return toSeconds(process.ctSeconds ?? process.contractedSeconds ?? process.st ?? process.pt);
};

const buildProcessOptions = (style) => {
  const rows = Array.isArray(style?.processes) ? style.processes : [];
  return rows.map((process, index) => ({
    id: process.instanceId || process.id || `${style?.id || 'style'}-proc-${index}`,
    code: process.code || '',
    name: process.name || `Process ${index + 1}`,
    pt: process.pt,
    st: process.st,
    ctSeconds: resolveCtSeconds(process),
  }));
};

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

const WorkItemRow = ({ item, onItemChange, onRemoveItem, onEnter, customers, styles, factory }) => {
  const rowRef = useRef(null);

  const filteredStyles = useMemo(
    () =>
      item.customer
        ? styles.filter((style) => style.customer === item.customer.name)
        : [],
    [item.customer, styles]
  );

  const processOptions = useMemo(() => buildProcessOptions(item.style), [item.style]);
  const wageInfo = calculateWage(item, factory);

  useEffect(() => {
    if (!item.customer && rowRef.current) {
      const input = rowRef.current.querySelector('input');
      if (input) input.focus();
    }
  }, []);

  return (
    <Box ref={rowRef} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
      <Box sx={{ minWidth: 180, flex: '1 1 180px' }}>
        <SearchableSelect
          label="Customer"
          options={customers}
          value={item.customer}
          onChange={(_event, value) => onItemChange('customer', value)}
          isOptionEqualToValue={(option, value) => option?.id === value?.id}
        />
      </Box>

      <Box sx={{ minWidth: 180, flex: '1 1 180px' }}>
        <SearchableSelect
          label="Style"
          options={filteredStyles}
          value={item.style}
          onChange={(_event, value) => onItemChange('style', value)}
          disabled={!item.customer}
          getOptionLabel={(option) => option?.name || ''}
          isOptionEqualToValue={(option, value) => option?.id === value?.id}
        />
      </Box>

      <Box sx={{ minWidth: 220, flex: '1 1 220px' }}>
        <SearchableSelect
          label="Process"
          options={processOptions}
          value={item.process}
          onChange={(_event, value) => onItemChange('process', value)}
          disabled={!item.style}
          getOptionLabel={(option) => `[${option?.code || '-'}] ${option?.name || ''}`}
          isOptionEqualToValue={(option, value) => option?.id === value?.id}
        />
      </Box>

      <Box sx={{ width: 110 }}>
        <TextField
          label="Qty"
          type="number"
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
            if (['-', '+', 'e', 'E', '.'].includes(event.key)) event.preventDefault();
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) onEnter?.();
          }}
          disabled={!item.process}
          inputProps={{ min: 1 }}
          fullWidth
        />
      </Box>

      <Box sx={{ width: 120 }}>
        <TextField
          label="CT sec/pc"
          value={item.process ? String(wageInfo.ctSeconds) : '-'}
          InputProps={{ readOnly: true }}
          variant="filled"
          fullWidth
        />
      </Box>

      <Box sx={{ width: 160 }}>
        <TextField
          label="Wage/pc"
          value={item.process ? wageInfo.wagePerPiece.toFixed(2) : '-'}
          InputProps={{ readOnly: true }}
          variant="filled"
          fullWidth
        />
      </Box>

      <Box sx={{ width: 180 }}>
        <TextField
          label="Total (CT)"
          value={item.quantity ? wageInfo.totalWage.toFixed(2) : '-'}
          InputProps={{ readOnly: true }}
          variant="filled"
          fullWidth
        />
      </Box>

      <IconButton onClick={onRemoveItem} color="error" tabIndex={-1}>
        <DeleteIcon />
      </IconButton>
    </Box>
  );
};

export default WorkItemRow;
