import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import {
  STATIC_OPTION_GROUPS,
  countStaticOptionItems,
} from '../../../constants/staticOptionRegistry';

const renderAliases = (aliases = []) => {
  if (!Array.isArray(aliases) || aliases.length === 0) return '-';
  return aliases.join(', ');
};

const StaticOptionBoard = () => {
  const groupCount = STATIC_OPTION_GROUPS.length;
  const itemCount = countStaticOptionItems();

  return (
    <AppPageContainer
      header={
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
          <Box>
            <Typography variant="h5" fontWeight={700}>
              정적 사전
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              앱에 하드코딩된 정적 코드 사전을 읽기 전용으로 보여줍니다. 누락된 라벨이나 alias를
              검토할 때 기준표로 사용하세요.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="flex-start" flexWrap="wrap">
            <Chip label={`그룹 ${groupCount}`} variant="outlined" />
            <Chip label={`항목 ${itemCount}`} variant="outlined" />
            <Button component={RouterLink} to="/system-setting" variant="outlined" size="small">
              구독 관리로 이동
            </Button>
          </Stack>
        </Stack>
      }
    >
      <Stack spacing={3}>
        {STATIC_OPTION_GROUPS.map((group) => (
          <Paper key={group.key} variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box
              sx={{
                px: 2,
                py: 1.5,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: 'grey.50',
              }}
            >
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
              >
                <Box>
                  <Typography variant="h6" fontWeight={700}>
                    {group.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    key: {group.key}
                  </Typography>
                </Box>
                <Chip label={`${group.items.length}개`} size="small" />
              </Stack>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: '16%' }}>Code</TableCell>
                    <TableCell sx={{ width: '14%' }}>한국어</TableCell>
                    <TableCell sx={{ width: '18%' }}>English</TableCell>
                    <TableCell sx={{ width: '18%' }}>Tiếng Việt</TableCell>
                    <TableCell>Aliases</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {group.items.map((item) => (
                    <TableRow key={item.code} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                        {item.code}
                      </TableCell>
                      <TableCell>{item.labels.ko || '-'}</TableCell>
                      <TableCell>{item.labels.en || '-'}</TableCell>
                      <TableCell>{item.labels.vi || '-'}</TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>
                        {renderAliases(item.aliases)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        ))}
      </Stack>
    </AppPageContainer>
  );
};

export default StaticOptionBoard;
