import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { getUiMessage } from '../../constants/uiMessages';
import {
  ORDER_STATUS_KEYS,
  getOrderStatusLabel,
} from '../../constants/orderStatus';
import { useAppActions } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import useWorkspaceRefreshOnEvent from '../../hooks/useWorkspaceRefreshOnEvent';
import { canAccessPath } from '../../utils/accessControl';
import { buildQueryString, requestJSON } from '../../utils/apiClient';
import { formatNumberWithCommas } from '../../utils/numberFormat';
import { fetchOrders } from '../../utils/orderApi';
import { subscribeOrderModificationLockChanged } from '../../utils/orderSyncEvents';
import { WORKSPACE_DATA_TOPICS } from '../../utils/workspaceDataEvents';

const resolveText = (bundle, languageCode) =>
  bundle?.[languageCode] || bundle?.ko || bundle?.en || '';

const DASHBOARD_TEXT = {
  title: {
    ko: '대시보드',
    en: 'Dashboard',
    vi: 'Bang dieu khien',
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
    ko: '요청한 기능을 이 영역에 순차적으로 붙일 수 있습니다.',
    en: 'Requested features can be added into these slots step by step.',
    vi: 'Co the gan cac tinh nang da yeu cau vao day theo tung buoc.',
  },
  live: {
    ko: '실시간',
    en: 'Live',
    vi: 'Truc tiep',
  },
  syncing: {
    ko: '연동 중',
    en: 'Syncing',
    vi: 'Dang dong bo',
  },
  pending: {
    ko: '준비중',
    en: 'Pending',
    vi: 'Dang chuan bi',
  },
  slotStatus: {
    ko: '준비됨',
    en: 'Ready',
    vi: 'San sang',
  },
  summaryLoadError: {
    ko: '대시보드 요약을 불러오지 못했습니다.',
    en: 'Failed to load dashboard summary.',
    vi: 'Khong the tai tom tat bang dieu khien.',
  },
};

const ORDER_STATUS_SUMMARY_KEYS = [
  ORDER_STATUS_KEYS.EDITING,
  ORDER_STATUS_KEYS.ORDER_RECEIVED,
  ORDER_STATUS_KEYS.IN_PROGRESS,
  ORDER_STATUS_KEYS.PRODUCTION_DONE,
];

const EMPTY_SUMMARY = Object.freeze({
  orderCounts: {
    [ORDER_STATUS_KEYS.EDITING]: 0,
    [ORDER_STATUS_KEYS.ORDER_RECEIVED]: 0,
    [ORDER_STATUS_KEYS.IN_PROGRESS]: 0,
    [ORDER_STATUS_KEYS.PRODUCTION_DONE]: 0,
  },
  monthlyAssignedOrderCount: 0,
  monthlyAssignedQuantity: 0,
  materialStockRate: null,
});

const createEmptySummary = () => ({
  orderCounts: { ...EMPTY_SUMMARY.orderCounts },
  monthlyAssignedOrderCount: EMPTY_SUMMARY.monthlyAssignedOrderCount,
  monthlyAssignedQuantity: EMPTY_SUMMARY.monthlyAssignedQuantity,
  materialStockRate: EMPTY_SUMMARY.materialStockRate,
});

const normalizeDateKey = (value) => {
  const key = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : '';
};

const buildDateKey = (value) => {
  const date = value instanceof Date ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCurrentMonthRange = (baseDate = new Date()) => {
  const anchor = baseDate instanceof Date ? new Date(baseDate) : new Date();
  anchor.setHours(0, 0, 0, 0);
  const startDate = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const endDate = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return {
    startKey: buildDateKey(startDate),
    endKey: buildDateKey(endDate),
  };
};

const resolveAssignmentRangeKeys = (assignment) => {
  const schedule = assignment?.ctSnapshot?.schedule;
  const startKey =
    normalizeDateKey(assignment?.startDateKey) ||
    normalizeDateKey(schedule?.startDateKey);
  const endKey =
    normalizeDateKey(assignment?.endDateKey) ||
    normalizeDateKey(schedule?.endDateKey) ||
    startKey;
  if (!startKey) return null;
  return {
    startKey,
    endKey: endKey || startKey,
  };
};

const isOverlappingDateRange = (range, monthRange) => {
  if (!range?.startKey || !range?.endKey || !monthRange?.startKey || !monthRange?.endKey) {
    return false;
  }
  return range.startKey <= monthRange.endKey && range.endKey >= monthRange.startKey;
};

const resolveAssignmentOrderKey = (assignment) => {
  const originOrderId = String(
    assignment?.originOrderId || assignment?.cardId || assignment?.id || ''
  ).trim();
  if (originOrderId) {
    const [orderKey] = originOrderId.split('::');
    if (orderKey) return orderKey;
  }
  return String(assignment?.orderNo || '').trim();
};

const formatInteger = (value) =>
  formatNumberWithCommas(value, {
    fallback: '0',
    maximumFractionDigits: 0,
  });

const COUNT_VALUE_SUFFIX = {
  order: {
    ko: '건',
    en: ' orders',
    vi: ' don',
  },
  quantity: {
    ko: '개',
    en: ' pcs',
    vi: ' cai',
  },
};

const resolveCountSuffix = (type, languageCode) =>
  COUNT_VALUE_SUFFIX[type]?.[languageCode] ||
  COUNT_VALUE_SUFFIX[type]?.ko ||
  '';

const formatCountValue = (value, loading, type, languageCode) => {
  if (loading) return '...';
  return `${formatInteger(Math.max(0, Number(value) || 0))}${resolveCountSuffix(
    type,
    languageCode
  )}`;
};

const formatPercentValue = (value, loading, pendingValue = '--%') => {
  if (loading) return '...';
  if (value === '' || value === null || value === undefined) return pendingValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return pendingValue;
  return `${formatInteger(parsed)}%`;
};

const buildSummaryData = ({ orders, assignments }) => {
  const summary = createEmptySummary();

  (Array.isArray(orders) ? orders : []).forEach((order) => {
    const statusKey = String(order?.status || '').trim().toUpperCase();
    if (!(statusKey in summary.orderCounts)) return;
    summary.orderCounts[statusKey] += 1;
  });

  const monthRange = getCurrentMonthRange();
  const assignedOrderKeySet = new Set();

  (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
    if (assignment?.isCompleted) return;
    const range = resolveAssignmentRangeKeys(assignment);
    if (!isOverlappingDateRange(range, monthRange)) return;

    const quantity = Math.max(0, Number(assignment?.quantity) || 0);
    if (quantity <= 0) return;

    summary.monthlyAssignedQuantity += quantity;

    const orderKey = resolveAssignmentOrderKey(assignment);
    if (orderKey) {
      assignedOrderKeySet.add(orderKey);
    }
  });

  summary.monthlyAssignedOrderCount = assignedOrderKeySet.size;
  return summary;
};

const buildSummaryCards = ({ languageCode, summaryData, summaryLoading }) => [
  {
    key: 'order-status',
    title: {
      ko: '주문 현황',
      en: 'Order Status',
      vi: 'Tinh trang don hang',
    },
    description: {
      ko: '실제 주문 상태 기준으로 집계됩니다.',
      en: 'Counts are based on the current real order status.',
      vi: 'So lieu duoc tinh theo trang thai don hang thuc te.',
    },
    statusItems: ORDER_STATUS_SUMMARY_KEYS.map((statusKey) => ({
      key: statusKey,
      label: {
        ko: getOrderStatusLabel(statusKey, statusKey, 'ko'),
        en: getOrderStatusLabel(statusKey, statusKey, 'en'),
        vi: getOrderStatusLabel(statusKey, statusKey, 'vi'),
      },
      value: formatCountValue(
        summaryData?.orderCounts?.[statusKey],
        summaryLoading,
        'order',
        languageCode
      ),
    })),
    badge: resolveText(
      summaryLoading ? DASHBOARD_TEXT.syncing : DASHBOARD_TEXT.live,
      languageCode
    ),
  },
  {
    key: 'monthly-production-plan',
    title: {
      ko: '이번달 제작 예정',
      en: 'This Month Plan',
      vi: 'Ke hoach thang nay',
    },
    description: {
      ko: '이번 달 일정이 걸린 미완료 배정 기준입니다.',
      en: 'Based on incomplete assignments scheduled in this month.',
      vi: 'Duoc tinh theo cac phan cong chua hoan tat trong thang nay.',
    },
    statusItems: [
      {
        key: 'assigned-orders',
        label: {
          ko: '배정 주문 수',
          en: 'Assigned Orders',
          vi: 'So don da phan cong',
        },
        value: formatCountValue(
          summaryData?.monthlyAssignedOrderCount,
          summaryLoading,
          'order',
          languageCode
        ),
      },
      {
        key: 'assigned-quantity',
        label: {
          ko: '배정 수량',
          en: 'Assigned Quantity',
          vi: 'So luong da phan cong',
        },
        value: formatCountValue(
          summaryData?.monthlyAssignedQuantity,
          summaryLoading,
          'quantity',
          languageCode
        ),
      },
    ],
    badge: resolveText(
      summaryLoading ? DASHBOARD_TEXT.syncing : DASHBOARD_TEXT.live,
      languageCode
    ),
  },
  {
    key: 'material-stock-rate',
    title: {
      ko: '원부자재 재고율',
      en: 'Material Stock Rate',
      vi: 'Ty le ton kho nguyen lieu',
    },
    description: {
      ko: '재고 관리와 BOM 연동 완료 후 실제 재고율로 계산할 예정입니다.',
      en: 'This will use real inventory and BOM data after that flow is completed.',
      vi: 'Se tinh theo ton kho va BOM thuc te sau khi tinh nang do hoan tat.',
    },
    value: formatPercentValue(summaryData?.materialStockRate, summaryLoading),
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
  const { navigateToPath, showNotification } = useAppActions();
  const {
    isAuthenticated,
    devBypass,
    devProfile,
    accessProfile,
    activeOrgId,
  } = useAuth();
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const authState = useMemo(
    () => ({
      isAuthenticated,
      devBypass,
      devProfile,
      accessProfile,
    }),
    [accessProfile, devBypass, devProfile, isAuthenticated]
  );

  const loadSummaryData = useCallback(
    async ({ forceRefresh = false, cancelledRef = null } = {}) => {
      if (!activeOrgId) {
        if (!cancelledRef?.current) {
          setSummaryData(createEmptySummary());
          setSummaryLoading(false);
        }
        return;
      }

      if (!cancelledRef?.current) {
        setSummaryLoading(true);
      }

      try {
        const boardQuery = buildQueryString({
          orgId: activeOrgId,
          includeCards: 0,
        });
        const [orders, boardState] = await Promise.all([
          fetchOrders({ orgId: activeOrgId, forceRefresh }),
          requestJSON('/assignment-board-view' + boardQuery, {
            forceRefresh,
            skipGlobalLoading: true,
          }),
        ]);
        if (!cancelledRef?.current) {
          setSummaryData(
            buildSummaryData({
              orders,
              assignments: Array.isArray(boardState?.assignments)
                ? boardState.assignments
                : [],
            })
          );
        }
      } catch (error) {
        if (!cancelledRef?.current) {
          setSummaryData(createEmptySummary());
          showNotification(
            error?.message ||
              resolveText(DASHBOARD_TEXT.summaryLoadError, languageCode),
            'error'
          );
        }
      } finally {
        if (!cancelledRef?.current) {
          setSummaryLoading(false);
        }
      }
    },
    [activeOrgId, languageCode, showNotification]
  );

  useEffect(() => {
    const cancelledRef = { current: false };
    void loadSummaryData({ cancelledRef });
    return () => {
      cancelledRef.current = true;
    };
  }, [loadSummaryData]);

  useWorkspaceRefreshOnEvent({
    orgId: activeOrgId,
    topics: [WORKSPACE_DATA_TOPICS.ORDERS, WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD],
    isActive: true,
    onRefresh: () => loadSummaryData({ forceRefresh: true }),
  });

  useEffect(() => {
    if (!activeOrgId) return undefined;
    return subscribeOrderModificationLockChanged((detail) => {
      const eventOrgId = Number(detail?.orgId);
      const currentOrgId = Number(activeOrgId);
      if (
        Number.isFinite(eventOrgId) &&
        eventOrgId > 0 &&
        Number.isFinite(currentOrgId) &&
        currentOrgId > 0 &&
        eventOrgId !== currentOrgId
      ) {
        return;
      }
      void loadSummaryData({ forceRefresh: true });
    });
  }, [activeOrgId, loadSummaryData]);

  const summaryCards = useMemo(
    () =>
      buildSummaryCards({
        languageCode,
        summaryData,
        summaryLoading,
      }),
    [languageCode, summaryData, summaryLoading]
  );

  const quickActions = useMemo(
    () =>
      buildQuickActions(languageCode).filter((item) =>
        canAccessPath(item.path, authState)
      ),
    [authState, languageCode]
  );

  return (
    <AppPageContainer title={resolveText(DASHBOARD_TEXT.title, languageCode)}>
      <Stack spacing={2}>
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
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ mb: 0.75 }}
                >
                  <Typography variant="subtitle2">
                    {resolveText(card.title, languageCode)}
                  </Typography>
                  <Chip label={card.badge} size="small" variant="outlined" />
                </Stack>
                {Array.isArray(card.statusItems) && card.statusItems.length > 0 ? (
                  <Stack spacing={0.5} sx={{ mb: 0.5 }}>
                    {card.statusItems.map((status) => (
                      <Stack
                        key={status.key}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                      >
                        <Typography variant="body2" color="text.secondary">
                          {resolveText(status.label, languageCode)}
                        </Typography>
                        <Typography variant="body1" sx={{ lineHeight: 1.3 }}>
                          {status.value}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body1" sx={{ lineHeight: 1.3, mb: 0.5 }}>
                    {card.value}
                  </Typography>
                )}
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
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
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
