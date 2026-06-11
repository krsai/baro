import React, { useMemo } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import { formatNumberWithCommas } from '../../../../utils/numberFormat';
import {
  DEFAULT_TIME_REF_QUANTITY,
  calculateProcessTotalForOrderQuantity,
  formatSeconds,
  hasAnyProcessTime,
  normalizeProcesses,
  resolveProcessStPerPieceSeconds,
} from '../../../../utils/processTime';

const parseCurrencyValue = (value) => {
  const normalized = String(value ?? '').replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const SUMMARY_LABEL_WIDTH = '30%';
const SUMMARY_VALUE_WIDTH = '70%';

const StyleAnalysis = ({ processes = [] }) => {
  const costData = [];
  const normalizedProcesses = useMemo(() => normalizeProcesses(processes), [processes]);

  // PT/AT are entered/reviewed as per-piece seconds at the 1,000 reference quantity.
  // Convert order totals back to per-piece for display consistency.
  const totalPT = useMemo(
    () =>
      calculateProcessTotalForOrderQuantity(
        normalizedProcesses,
        'pt',
        DEFAULT_TIME_REF_QUANTITY
      ) / DEFAULT_TIME_REF_QUANTITY,
    [normalizedProcesses]
  );

  const totalAT = useMemo(
    () =>
      calculateProcessTotalForOrderQuantity(
        normalizedProcesses,
        'at',
        DEFAULT_TIME_REF_QUANTITY
      ) / DEFAULT_TIME_REF_QUANTITY,
    [normalizedProcesses]
  );

  const hasTotalPT = useMemo(
    () => hasAnyProcessTime(normalizedProcesses, 'pt'),
    [normalizedProcesses]
  );

  const hasTotalAT = useMemo(
    () => hasAnyProcessTime(normalizedProcesses, 'at'),
    [normalizedProcesses]
  );

  const totalST = useMemo(
    () =>
      normalizedProcesses.reduce((sum, p) => {
        const st = resolveProcessStPerPieceSeconds(p, DEFAULT_TIME_REF_QUANTITY);
        return sum + (st != null ? st : 0);
      }, 0),
    [normalizedProcesses]
  );

  const hasTotalST = totalST > 0;

  const subtotal = costData.reduce((acc, item) => acc + parseCurrencyValue(item.cost), 0);
  const overhead = subtotal * 0.1;
  const totalCost = subtotal + overhead;

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        스타일 분석
      </Typography>

      <Stack spacing={2} sx={{ mt: 2.5, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ width: SUMMARY_LABEL_WIDTH, pr: 1 }}
          >
            총 공정 수
          </Typography>
          <Typography
            variant="body2"
            sx={{ width: SUMMARY_VALUE_WIDTH, textAlign: 'right', fontWeight: 500 }}
          >
            {formatNumberWithCommas(normalizedProcesses.length, {
              fallback: '0',
              maximumFractionDigits: 0,
            })}{' '}
            개
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ width: SUMMARY_LABEL_WIDTH, pr: 1 }}
          >
            총 PT(1,000)
          </Typography>
          <Typography
            variant="body2"
            sx={{ width: SUMMARY_VALUE_WIDTH, textAlign: 'right', fontWeight: 500 }}
          >
            {hasTotalPT ? formatSeconds(totalPT) : '-'}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ width: SUMMARY_LABEL_WIDTH, pr: 1 }}
          >
            총 ST(1,000)
          </Typography>
          <Typography
            variant="body2"
            sx={{ width: SUMMARY_VALUE_WIDTH, textAlign: 'right', fontWeight: 500 }}
          >
            {hasTotalST ? formatSeconds(totalST) : '-'}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ width: SUMMARY_LABEL_WIDTH, pr: 1 }}
          >
            총 AT(1,000)
          </Typography>
          <Typography
            variant="body2"
            sx={{ width: SUMMARY_VALUE_WIDTH, textAlign: 'right', fontWeight: 500 }}
          >
            {hasTotalAT ? formatSeconds(totalAT) : '-'}
          </Typography>
        </Box>
      </Stack>

      <Divider sx={{ my: 4 }} />

      <Typography variant="h6" gutterBottom>
        예상 비용
      </Typography>
      <Paper elevation={2} sx={{ p: 2, mt: 2.5, bgcolor: 'grey.50' }}>
        <Stack spacing={2}>
          <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary' }}>
            <Typography variant="body2" sx={{ width: SUMMARY_LABEL_WIDTH, pr: 1 }}>
              항목
            </Typography>
            <Typography
              variant="body2"
              sx={{ width: SUMMARY_VALUE_WIDTH, textAlign: 'right' }}
            >
              금액
            </Typography>
          </Box>
          <Divider />

          {costData.map((row) => (
            <Box key={row.item} sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="body2" sx={{ width: SUMMARY_LABEL_WIDTH, pr: 1 }}>
                {row.item}
              </Typography>
              <Typography
                variant="body2"
                sx={{ width: SUMMARY_VALUE_WIDTH, textAlign: 'right' }}
              >
                {row.cost}
              </Typography>
            </Box>
          ))}

          <Divider sx={{ my: 1 }} />

          <Stack spacing={1}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="body1" sx={{ width: SUMMARY_LABEL_WIDTH, pr: 1 }}>
                소계
              </Typography>
              <Typography
                variant="body1"
                sx={{ width: SUMMARY_VALUE_WIDTH, textAlign: 'right' }}
              >
                {`${formatNumberWithCommas(subtotal, {
                  fallback: '0',
                  maximumFractionDigits: 2,
                })} 원`}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ width: SUMMARY_LABEL_WIDTH, pr: 1 }}
              >
                추가 비용 (10%)
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ width: SUMMARY_VALUE_WIDTH, textAlign: 'right' }}
              >
                {`${formatNumberWithCommas(overhead, {
                  fallback: '0',
                  maximumFractionDigits: 2,
                })} 원`}
              </Typography>
            </Box>
          </Stack>

          <Divider sx={{ my: 1 }} />

          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography
              variant="h6"
              sx={{ width: SUMMARY_LABEL_WIDTH, pr: 1, fontWeight: 'bold' }}
            >
              총비용
            </Typography>
            <Typography
              variant="h6"
              sx={{ width: SUMMARY_VALUE_WIDTH, textAlign: 'right', fontWeight: 'bold' }}
            >
              {`${formatNumberWithCommas(totalCost, {
                fallback: '0',
                maximumFractionDigits: 2,
              })} 원`}
            </Typography>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
};

export default StyleAnalysis;
