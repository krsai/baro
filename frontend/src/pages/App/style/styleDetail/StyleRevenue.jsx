import React, { useMemo, useState } from 'react';
import {
  Box,
  InputAdornment,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useLanguage } from '../../../../context/LanguageContext';
import { ST_STANDARD_BUCKETS } from '../../../../utils/processTime';
import { formatNumberWithCommas } from '../../../../utils/numberFormat';

const HIDDEN_BUCKETS = new Set([2, 20]);
const PRICE_BUCKETS = ST_STANDARD_BUCKETS.filter((q) => !HIDDEN_BUCKETS.has(q));

const MSG = {
  ko: {
    title: '매출 단가',
    qty: '수량',
    price: '한 벌당 단가 (USD)',
    memo: '메모',
    memoHelper: '가격 조건, 계약 참고사항 등',
  },
  en: {
    title: 'Revenue Price',
    qty: 'Quantity',
    price: 'Unit Price (USD)',
    memo: 'Memo',
    memoHelper: 'Price conditions, contract notes, etc.',
  },
  vi: {
    title: 'Don gia ban',
    qty: 'So luong',
    price: 'Don gia / chiec (USD)',
    memo: 'Ghi chu',
    memoHelper: 'Dieu kien gia, ghi chu hop dong...',
  },
};

const fmtQty = (q) => formatNumberWithCommas(q, { maximumFractionDigits: 0 });

const formatPriceDisplay = (val) => {
  if (val == null || val === '') return '';
  const num = parseFloat(String(val));
  return Number.isFinite(num) ? num.toFixed(2) : String(val);
};

const StyleRevenue = ({ formData, handleInputChange }) => {
  const { languageCode } = useLanguage();
  const msg = MSG[languageCode === 'vi' ? 'vi' : languageCode === 'en' ? 'en' : 'ko'];
  const [focusedBucket, setFocusedBucket] = useState(null);

  const priceMap = useMemo(() => {
    const buckets = Array.isArray(formData?.revenuePriceBuckets) ? formData.revenuePriceBuckets : [];
    const map = {};
    buckets.forEach(({ bucketQuantity, priceUsd }) => {
      if (bucketQuantity != null) map[bucketQuantity] = priceUsd;
    });
    return map;
  }, [formData?.revenuePriceBuckets]);

  const handlePriceChange = (bucketQuantity, rawValue) => {
    const cleaned = rawValue.replace(/[^\d.]/g, '');
    const value = cleaned === '' ? null : cleaned;

    const current = Array.isArray(formData?.revenuePriceBuckets) ? [...formData.revenuePriceBuckets] : [];
    const idx = current.findIndex((b) => b.bucketQuantity === bucketQuantity);
    if (idx >= 0) {
      current[idx] = { bucketQuantity, priceUsd: value };
    } else {
      current.push({ bucketQuantity, priceUsd: value });
    }
    handleInputChange({ target: { name: 'revenuePriceBuckets', value: current } });
  };

  return (
    <Box sx={{ maxWidth: 480 }}>
      <Paper variant="outlined" sx={{ borderRadius: 2, p: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2.5 }}>
          {msg.title}
        </Typography>

        <Table size="small" sx={{ mb: 3 }}>
          <TableHead>
            <TableRow sx={{ backgroundColor: '#F8FAFC' }}>
              <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: 12, width: 100 }}>
                {msg.qty}
              </TableCell>
              <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: 12 }}>
                {msg.price}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {PRICE_BUCKETS.map((qty, i) => {
              const priceVal = priceMap[qty];
              const displayVal = focusedBucket === qty
                ? (priceVal == null ? '' : String(priceVal))
                : formatPriceDisplay(priceVal);
              const rowBg = i % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
              return (
                <TableRow key={qty} sx={{ backgroundColor: rowBg }}>
                  <TableCell
                    sx={{
                      fontVariantNumeric: 'tabular-nums',
                      color: 'text.secondary',
                      fontSize: 13,
                    }}
                  >
                    {fmtQty(qty)}
                  </TableCell>
                  <TableCell sx={{ py: '4px' }}>
                    <TextField
                      value={displayVal}
                      onChange={(e) => handlePriceChange(qty, e.target.value)}
                      onFocus={() => setFocusedBucket(qty)}
                      onBlur={() => setFocusedBucket(null)}
                      size="small"
                      placeholder="-"
                      inputProps={{
                        inputMode: 'decimal',
                        style: { fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontSize: 13 },
                      }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      }}
                      sx={{
                        width: 140,
                        '& .MuiOutlinedInput-root': {
                          backgroundColor: displayVal ? 'rgba(17,24,39,0.02)' : 'transparent',
                          '& fieldset': { borderColor: 'rgba(17,24,39,0.15)' },
                          '&:hover fieldset': { borderColor: 'rgba(17,24,39,0.35)' },
                        },
                      }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <TextField
          label={msg.memo}
          name="revenueMemo"
          value={formData?.revenueMemo || ''}
          onChange={handleInputChange}
          size="small"
          multiline
          minRows={3}
          helperText={msg.memoHelper}
          fullWidth
        />
      </Paper>
    </Box>
  );
};

export default StyleRevenue;
