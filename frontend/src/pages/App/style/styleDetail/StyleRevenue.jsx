import React, { useMemo } from 'react';
import {
  Box,
  Divider,
  InputAdornment,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { useLanguage } from '../../../../context/LanguageContext';
import { formatNumberWithCommas, parseNumberLike } from '../../../../utils/numberFormat';

const MSG = {
  ko: {
    title: '매출 단가',
    unitPrice: '장당 단가',
    unitPriceHelper: '1장(피스)당 판매 단가 (달러)',
    memo: '메모',
    memoHelper: '가격 조건, 계약 참고사항 등',
    summaryTitle: '참고 계산',
    summaryHint: '장당 단가를 입력하면 주문 수량별 예상 매출을 확인할 수 있습니다.',
  },
  en: {
    title: 'Revenue',
    unitPrice: 'Unit Price',
    unitPriceHelper: 'Selling price per piece (USD)',
    memo: 'Memo',
    memoHelper: 'Price conditions, contract notes, etc.',
    summaryTitle: 'Reference',
    summaryHint: 'Enter a unit price to estimate revenue by order quantity.',
  },
  vi: {
    title: 'Doanh thu',
    unitPrice: 'Don gia / san pham',
    unitPriceHelper: 'Gia ban moi san pham (USD)',
    memo: 'Ghi chu',
    memoHelper: 'Dieu kien gia, ghi chu hop dong...',
    summaryTitle: 'Tham khao',
    summaryHint: 'Nhap don gia de uoc tinh doanh thu theo so luong.',
  },
};

const SAMPLE_QTYS = [100, 300, 500, 1000, 3000, 5000];

const fmtUsd = (v) => {
  if (v == null || !Number.isFinite(Number(v))) return '-';
  return `$${formatNumberWithCommas(Number(v), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const StyleRevenue = ({ formData, handleInputChange }) => {
  const { languageCode } = useLanguage();
  const msg = MSG[languageCode === 'vi' ? 'vi' : languageCode === 'en' ? 'en' : 'ko'];

  const unitPrice = formData?.unitPriceUsd;
  const parsedPrice = parseNumberLike(String(unitPrice ?? '').replace(/,/g, ''));
  const hasPrice = Number.isFinite(parsedPrice) && parsedPrice > 0;

  const handleUnitPriceChange = (e) => {
    const raw = e.target.value.replace(/[^\d.]/g, '');
    handleInputChange({ target: { name: 'unitPriceUsd', value: raw === '' ? null : Number(raw) || raw } });
  };

  const displayPrice = useMemo(() => {
    if (unitPrice == null || unitPrice === '') return '';
    const n = Number(String(unitPrice).replace(/,/g, ''));
    if (!Number.isFinite(n)) return String(unitPrice);
    return n % 1 === 0 ? String(n) : n.toFixed(2);
  }, [unitPrice]);

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Paper variant="outlined" sx={{ borderRadius: 2, p: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2.5 }}>
          {msg.title}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* 장당 단가 */}
          <TextField
            label={msg.unitPrice}
            name="unitPriceUsd"
            value={displayPrice}
            onChange={handleUnitPriceChange}
            size="small"
            helperText={msg.unitPriceHelper}
            inputProps={{ inputMode: 'decimal', style: { fontVariantNumeric: 'tabular-nums', fontSize: 15, fontWeight: 600 } }}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            }}
            sx={{ maxWidth: 220 }}
          />

          {/* 메모 */}
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
        </Box>

        {/* 참고 계산 */}
        {hasPrice && (
          <>
            <Divider sx={{ my: 3 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: 'text.secondary' }}>
              {msg.summaryTitle}
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 1,
              }}
            >
              {SAMPLE_QTYS.map((qty) => (
                <Box
                  key={qty}
                  sx={{
                    px: 2,
                    py: 1.25,
                    borderRadius: 1.5,
                    backgroundColor: '#F8FAFC',
                    border: '1px solid rgba(17,24,39,0.08)',
                    textAlign: 'center',
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
                    {formatNumberWithCommas(qty, { maximumFractionDigits: 0 })}장
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}>
                    {fmtUsd(parsedPrice * qty)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </>
        )}
      </Paper>
    </Box>
  );
};

export default StyleRevenue;
