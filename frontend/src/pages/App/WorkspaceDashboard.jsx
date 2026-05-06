import React, { useMemo } from 'react';
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import StyleIcon from '@mui/icons-material/Style';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import HistoryIcon from '@mui/icons-material/History';
import AppPageContainer from '../../components/AppPageContainer';
import { useLanguage } from '../../context/LanguageContext';
import { useAppActions } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { canAccessPath } from '../../utils/accessControl';
import { getUiMessage } from '../../constants/uiMessages';

const resolveText = (bundle, languageCode) =>
  bundle?.[languageCode] || bundle?.ko || bundle?.en || '';

const DASHBOARD_TEXT = {
  title: {
    ko: '라이트 홈',
    en: 'Light Home',
    vi: 'Trang chu nhe',
  },
  subtitle: {
    ko: '가벼운 첫 화면입니다. 필요한 지표와 기능을 순서대로 붙여나갈 수 있습니다.',
    en: 'A lightweight first screen. We can attach metrics and features step by step.',
    vi: 'Day la man hinh dau nhe. Co the gan cac chi so va tinh nang tung buoc.',
  },
  summaryTitle: {
    ko: '핵심 요약',
    en: 'Key Summary',
    vi: 'Tom tat chinh',
  },
  quickActionTitle: {
    ko: '빠른 이동',
    en: 'Quick Actions',
    vi: 'Di chuyen nhanh',
  },
  widgetSlotTitle: {
    ko: '위젯 슬롯',
    en: 'Widget Slots',
    vi: 'O widget',
  },
  widgetSlotDescription: {
    ko: '원하는 기능을 여기 슬롯에 하나씩 넣어가면 됩니다.',
    en: 'Add each requested feature into these slots one by one.',
    vi: 'Them tung tinh nang mong muon vao cac o nay.',
  },
  pending: {
    ko: '연결 예정',
    en: 'Pending',
    vi: 'Dang cho ket noi',
  },
  slotStatus: {
    ko: '준비됨',
    en: 'Ready',
    vi: 'San sang',
  },
};

const buildSummaryCards = (languageCode) => [
  {
    key: 'unlock-orders',
    title: {
      ko: '미잠금 주문',
      en: 'Unlocked Orders',
      vi: 'Don hang chua khoa',
    },
    description: {
      ko: '잠금이 꺼진 주문 수',
      en: 'Orders with edit lock off',
      vi: 'So don hang tat khoa sua',
    },
    value: '—',
    badge: resolveText(DASHBOARD_TEXT.pending, languageCode),
  },
  {
    key: 'in-progress-orders',
    title: {
      ko: '진행 주문',
      en: 'In-Progress Orders',
      vi: 'Don hang dang tien hanh',
    },
    description: {
      ko: '완료 전 단계 주문 수',
      en: 'Orders before completion',
      vi: 'So don hang truoc khi hoan thanh',
    },
    value: '—',
    badge: resolveText(DASHBOARD_TEXT.pending, languageCode),
  },
  {
    key: 'alerts',
    title: {
      ko: '알림',
      en: 'Alerts',
      vi: 'Canh bao',
    },
    description: {
      ko: '중요 안내/주의 항목',
      en: 'Important notices and warnings',
      vi: 'Thong bao va canh bao quan trong',
    },
    value: '—',
    badge: resolveText(DASHBOARD_TEXT.pending, languageCode),
  },
];

const buildQuickActions = (languageCode) => [
  {
    path: '/order',
    label: getUiMessage('menu.order', '주문', languageCode),
    icon: <ShoppingCartIcon fontSize="small" />,
  },
  {
    path: '/style',
    label: getUiMessage('menu.style', '스타일', languageCode),
    icon: <StyleIcon fontSize="small" />,
  },
  {
    path: '/assignment',
    label: getUiMessage('menu.assignment', '배정', languageCode),
    icon: <ContentCutIcon fontSize="small" />,
  },
  {
    path: '/work-history',
    label: getUiMessage('menu.workHistory', '기록', languageCode),
    icon: <HistoryIcon fontSize="small" />,
  },
];

const WorkspaceDashboard = () => {
  const { languageCode } = useLanguage();
  const { navigateToPath } = useAppActions();
  const { isAuthenticated, devBypass, devProfile, accessProfile } = useAuth();

  const authState = useMemo(
    () => ({
      isAuthenticated,
      devBypass,
      devProfile,
      accessProfile,
    }),
    [accessProfile, devBypass, devProfile, isAuthenticated]
  );

  const summaryCards = useMemo(() => buildSummaryCards(languageCode), [languageCode]);
  const quickActions = useMemo(
    () =>
      buildQuickActions(languageCode).filter((item) => canAccessPath(item.path, authState)),
    [authState, languageCode]
  );

  return (
    <AppPageContainer title={resolveText(DASHBOARD_TEXT.title, languageCode)}>
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2.25 }}>
          <Typography variant="body1" color="text.secondary">
            {resolveText(DASHBOARD_TEXT.subtitle, languageCode)}
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.25 }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            {resolveText(DASHBOARD_TEXT.summaryTitle, languageCode)}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                md: 'repeat(3, minmax(0, 1fr))',
              },
              gap: 1.5,
            }}
          >
            {summaryCards.map((card) => (
              <Paper
                key={card.key}
                variant="outlined"
                sx={{
                  p: 1.75,
                  borderRadius: 1.5,
                  borderStyle: 'dashed',
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
                  <Typography variant="subtitle2">{resolveText(card.title, languageCode)}</Typography>
                  <Chip label={card.badge} size="small" variant="outlined" />
                </Stack>
                <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.1, mb: 0.5 }}>
                  {card.value}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {resolveText(card.description, languageCode)}
                </Typography>
              </Paper>
            ))}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.25 }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            {resolveText(DASHBOARD_TEXT.quickActionTitle, languageCode)}
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {quickActions.map((action) => (
              <Button
                key={action.path}
                variant="outlined"
                startIcon={action.icon}
                onClick={() => navigateToPath(action.path, { label: action.label })}
              >
                {action.label}
              </Button>
            ))}
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.25 }}>
          <Typography variant="h6" sx={{ mb: 0.75 }}>
            {resolveText(DASHBOARD_TEXT.widgetSlotTitle, languageCode)}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {resolveText(DASHBOARD_TEXT.widgetSlotDescription, languageCode)}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
              gap: 1.25,
            }}
          >
            {['A', 'B', 'C', 'D'].map((slotId) => (
              <Paper
                key={slotId}
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderStyle: 'dashed',
                  borderColor: 'divider',
                  bgcolor: '#fafafa',
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle2">{`Slot ${slotId}`}</Typography>
                  <Chip
                    size="small"
                    color="success"
                    variant="outlined"
                    label={resolveText(DASHBOARD_TEXT.slotStatus, languageCode)}
                  />
                </Stack>
              </Paper>
            ))}
          </Box>
        </Paper>
      </Stack>
    </AppPageContainer>
  );
};

export default WorkspaceDashboard;
