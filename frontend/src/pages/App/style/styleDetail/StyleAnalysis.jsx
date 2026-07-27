import React, { useMemo } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import {
  DEFAULT_TIME_REF_QUANTITY,
  calculateProcessDisplayAtTotalForOrderQuantity,
  calculateProcessTotalForOrderQuantity,
  formatSeconds,
  hasCompleteDisplayableProcessAtTime,
  hasAnyProcessTime,
  normalizeProcesses,
  resolveProcessStPerPieceSeconds,
} from '../../../../utils/processTime';
import { formatNumberWithCommas } from '../../../../utils/numberFormat';

const SUMMARY_LABEL_WIDTH = '30%';
const SUMMARY_VALUE_WIDTH = '70%';

const StyleAnalysis = ({ processes = [], bucketQuantities = [] }) => {
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
    () => {
      const total = calculateProcessDisplayAtTotalForOrderQuantity(
        normalizedProcesses,
        DEFAULT_TIME_REF_QUANTITY,
        bucketQuantities
      );
      return total == null ? null : total / DEFAULT_TIME_REF_QUANTITY;
    },
    [normalizedProcesses, bucketQuantities]
  );

  const hasTotalPT = useMemo(
    () => hasAnyProcessTime(normalizedProcesses, 'pt'),
    [normalizedProcesses]
  );

  const hasTotalAT = useMemo(
    () => hasCompleteDisplayableProcessAtTime(
      normalizedProcesses,
      DEFAULT_TIME_REF_QUANTITY,
      bucketQuantities
    ),
    [normalizedProcesses, bucketQuantities]
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

    </Box>
  );
};

export default StyleAnalysis;
