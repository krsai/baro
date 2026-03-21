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
import PageToolbar from '../../../components/PageToolbar';
import {
  STATIC_OPTION_GROUPS,
  countStaticOptionItems,
} from '../../../constants/staticOptionRegistry';
import { getUiMessage } from '../../../constants/uiMessages';
import { useLanguage } from '../../../context/LanguageContext';

const renderAliases = (aliases = []) => {
  if (!Array.isArray(aliases) || aliases.length === 0) return '-';
  return aliases.join(', ');
};

const StaticOptionBoard = () => {
  const { languageCode } = useLanguage();
  const groupCount = STATIC_OPTION_GROUPS.length;
  const itemCount = countStaticOptionItems();

  return (
    <AppPageContainer
      title={getUiMessage('staticOptionBoard.title', '정적 사전', languageCode)}
      toolbar={(
        <PageToolbar
          right={(
            <>
              <Chip
                label={getUiMessage(
                  'staticOptionBoard.groupCount',
                  `그룹 ${groupCount}`,
                  languageCode,
                  { count: groupCount }
                )}
                variant="outlined"
              />
              <Chip
                label={getUiMessage(
                  'staticOptionBoard.itemCount',
                  `항목 ${itemCount}`,
                  languageCode,
                  { count: itemCount }
                )}
                variant="outlined"
              />
              <Button component={RouterLink} to="/system-setting" variant="outlined" size="small">
                {getUiMessage(
                  'staticOptionBoard.goToSystemSetting',
                  '구독 관리로 이동',
                  languageCode
                )}
              </Button>
            </>
          )}
        />
      )}
    >
      <Stack spacing={3}>
        {STATIC_OPTION_GROUPS.map((group) => (
          <Paper key={group.key} variant="outlined" sx={{ overflow: 'hidden', borderRadius: 2 }}>
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
                    {getUiMessage('staticOptionBoard.groupKey', `key: ${group.key}`, languageCode, {
                      key: group.key,
                    })}
                  </Typography>
                </Box>
                <Chip
                  label={getUiMessage(
                    'staticOptionBoard.itemCountChip',
                    `${group.items.length}개`,
                    languageCode,
                    { count: group.items.length }
                  )}
                  size="small"
                />
              </Stack>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: '16%' }}>
                      {getUiMessage('staticOptionBoard.columnCode', 'Code', languageCode)}
                    </TableCell>
                    <TableCell sx={{ width: '14%' }}>
                      {getUiMessage('staticOptionBoard.columnKo', '한국어', languageCode)}
                    </TableCell>
                    <TableCell sx={{ width: '18%' }}>
                      {getUiMessage('staticOptionBoard.columnEn', 'English', languageCode)}
                    </TableCell>
                    <TableCell sx={{ width: '18%' }}>
                      {getUiMessage('staticOptionBoard.columnVi', 'Tiếng Việt', languageCode)}
                    </TableCell>
                    <TableCell>
                      {getUiMessage('staticOptionBoard.columnAliases', 'Aliases', languageCode)}
                    </TableCell>
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
