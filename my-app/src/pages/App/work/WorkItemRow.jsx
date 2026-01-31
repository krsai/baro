import React, { useMemo, useRef, useEffect } from 'react';
import { Box, Typography, IconButton, TextField } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchableSelect from '../../../components/SearchableSelect';

const calculateWage = (item, factory) => {
    if (!item.process || !item.quantity || !factory) return { wagePerPiece: 0, totalWage: 0, standard: '-' };
    
    const wagePerPiece = item.process.paymentValue * factory.perSecondWage;
    const totalWage = wagePerPiece * item.quantity;
    
    return { 
        standard: item.process.paymentStandard,
        wagePerPiece: wagePerPiece.toFixed(2),
        totalWage: totalWage.toFixed(2),
    };
};

const WorkItemRow = ({
  item,
  onItemChange,
  onRemoveItem,
  onEnter,
  customers,
  styles,
  processes,
  factory,
}) => {
  const rowRef = useRef(null);
  const filteredStyles = useMemo(() => item.customer ? styles.filter(s => s.customerId === item.customer.id) : [], [item.customer, styles]);
  const filteredProcesses = useMemo(() => item.style ? processes.filter(p => p.styleId === item.style.id) : [], [item.style, processes]);
  const wageInfo = calculateWage(item, factory);

  useEffect(() => {
    if (!item.customer && rowRef.current) {
      const input = rowRef.current.querySelector('input');
      if (input) {
        input.focus();
      }
    }
  }, []);

  return (
    <Box ref={rowRef} sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <SearchableSelect
          sx={{ width: '100%' }}
          label="고객사"
          options={customers}
          value={item.customer}
          onChange={(e, val) => onItemChange('customer', val)}
        />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <SearchableSelect
          sx={{ width: '100%' }}
          label="스타일"
          options={filteredStyles}
          value={item.style}
          onChange={(e, val) => onItemChange('style', val)}
          disabled={!item.customer}
        />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <SearchableSelect
          sx={{ width: '100%' }}
          label="공정"
          options={filteredProcesses}
          value={item.process}
          onChange={(e, val) => onItemChange('process', val)}
          disabled={!item.style}
        />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <TextField
          sx={{ width: '100%' }}
          label="수량"
          type="number"
          value={item.quantity}
          onChange={e => onItemChange('quantity', parseInt(e.target.value, 10) || '')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              if (onEnter) onEnter();
            }
          }}
          disabled={!item.process}
        />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <TextField
          sx={{ width: '100%' }}
          label="공임 단가"
          value={item.process ? `${wageInfo.standard} / ${wageInfo.wagePerPiece}` : '-'}
          InputProps={{
            readOnly: true,
          }}
          inputProps={{ tabIndex: -1 }}
          variant="filled"
        />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <TextField
          sx={{ width: '100%' }}
          label="합계"
          value={item.quantity ? wageInfo.totalWage : '-'}
          InputProps={{
            readOnly: true,
          }}
          inputProps={{ tabIndex: -1 }}
          variant="filled"
        />
      </Box>
      <IconButton onClick={onRemoveItem} color="error" tabIndex={-1}>
        <DeleteIcon />
      </IconButton>
    </Box>
  );
};

export default WorkItemRow;
