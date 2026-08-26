import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import StyleIcon from '@mui/icons-material/Style';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import HistoryIcon from '@mui/icons-material/History';
import GroupIcon from '@mui/icons-material/Group';
import DnsIcon from '@mui/icons-material/Dns';
import TuneIcon from '@mui/icons-material/Tune';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AppPageContainer from '../../components/AppPageContainer';
import {
  STATIC_OPTION_GROUPS,
  countStaticOptionItems,
} from '../../constants/staticOptionRegistry';
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
    vi: 'Bảng điều khiển',
  },
  summaryTitle: {
    ko: '핵심 요약',
    en: 'Key Summary',
    vi: 'Tom tat chinh',
  },
  systemSummaryTitle: {
    ko: '시스템 요약',
    en: 'System Summary',
    vi: 'Tom tat he thong',
  },
  quickActionTitle: {
    ko: '빠른 이동',
    en: 'Quick Actions',
    vi: 'Di chuyen nhanh',
  },
  notificationTitle: { ko: '알림', en: 'Notifications', vi: 'Thông báo' },
  notificationDescription: { ko: '확인이 필요한 항목을 모아 보여줍니다.', en: 'Items that need your attention.', vi: 'Các mục cần bạn kiểm tra.' },
  notificationEmpty: { ko: '확인이 필요한 알림이 없습니다.', en: 'You are all caught up.', vi: 'Không có thông báo cần kiểm tra.' },
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
    vi: 'Đang đồng bộ',
  },
  pending: {
    ko: '준비중',
    en: 'Pending',
    vi: 'Đang chuẩn bị',
  },
  slotStatus: {
    ko: '준비됨',
    en: 'Ready',
    vi: 'San sang',
  },
  summaryLoadError: {
    ko: '대시보드 요약을 불러오지 못했습니다.',
    en: 'Failed to load dashboard summary.',
    vi: 'Không thể tai tom tat bang dieu khien.',
  },
  systemPolicyLinked: {
    ko: '메뉴 연동',
    en: 'Menu-linked',
    vi: 'Lien ket menu',
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
  pendingEmployeeCount: 0,
  unassignedLineWorkerCount: 0,
  missingSalesPriceCustomerCount: 0,
});

const createEmptySummary = () => ({
  orderCounts: { ...EMPTY_SUMMARY.orderCounts },
  monthlyAssignedOrderCount: EMPTY_SUMMARY.monthlyAssignedOrderCount,
  monthlyAssignedQuantity: EMPTY_SUMMARY.monthlyAssignedQuantity,
  materialStockRate: EMPTY_SUMMARY.materialStockRate,
  pendingEmployeeCount: EMPTY_SUMMARY.pendingEmployeeCount,
  unassignedLineWorkerCount: EMPTY_SUMMARY.unassignedLineWorkerCount,
  missingSalesPriceCustomerCount: EMPTY_SUMMARY.missingSalesPriceCustomerCount,
});

const EMPTY_SYSTEM_SUMMARY = Object.freeze({
  pendingOnboardingCount: 0,
});

const createEmptySystemSummary = () => ({
  pendingOnboardingCount: EMPTY_SYSTEM_SUMMARY.pendingOnboardingCount,
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
  const schedule = (assignment?.assignmentCtSnapshot ?? assignment?.ctSnapshot)?.schedule;
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
  const workOrderId = Number(assignment?.workOrderId);
  return Number.isInteger(workOrderId) && workOrderId > 0 ? String(workOrderId) : '';
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

const formatPlainValue = (value, loading) => {
  if (loading) return '...';
  return formatInteger(Math.max(0, Number(value) || 0));
};

const SUMMARY_CARD_SX = {
  p: 1.5,
  borderRadius: 1,
  borderColor: 'divider',
  bgcolor: '#fcfcfd',
};

const SUMMARY_TITLE_SX = {
  fontSize: 13,
  lineHeight: 1.35,
  fontWeight: 700,
};

const SUMMARY_BADGE_SX = {
  height: 22,
  borderRadius: '11px',
  fontSize: 11,
  fontWeight: 500,
  '& .MuiChip-label': {
    px: 0.85,
  },
};

const SUMMARY_LABEL_SX = {
  fontSize: 12,
  lineHeight: 1.45,
};

const SUMMARY_VALUE_SX = {
  fontSize: 13,
  lineHeight: 1.45,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  color: 'text.primary',
};

const SUMMARY_DESCRIPTION_SX = {
  display: 'block',
  mt: 0.75,
  fontSize: 11.5,
  lineHeight: 1.45,
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
          vi: 'Số lượng da phan cong',
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

const buildSystemSummaryCards = ({ languageCode, summaryLoading, systemSummaryData }) => [
  {
    key: 'system-access-policy',
    title: {
      ko: '접근 권한',
      en: 'Access Policy',
      vi: 'Chính sách truy cap',
    },
    description: {
      ko: '현재 메뉴 구조에 연결된 역할별 접근 권한을 관리합니다.',
      en: 'Manage role-based access linked to the current menu structure.',
      vi: 'Quản lý quyen truy cap theo vai tro duoc lien ket voi cau truc menu hien tai.',
    },
    value: resolveText(DASHBOARD_TEXT.systemPolicyLinked, languageCode),
    badge: resolveText(DASHBOARD_TEXT.slotStatus, languageCode),
  },
  {
    key: 'system-onboarding',
    title: {
      ko: '가입 승인',
      en: 'Onboarding Approval',
      vi: 'Duyet dang ky',
    },
    description: {
      ko: '대기 중인 조직 가입 요청을 검토하고 승인합니다.',
      en: 'Review and approve pending organization onboarding requests.',
      vi: 'Xem xet va phe duyet cac yeu cau dang ky to chuc dang cho xu ly.',
    },
    statusItems: [
      {
        key: 'pending-onboarding-count',
        label: {
          ko: '대기 요청',
          en: 'Pending Requests',
          vi: 'Yeu cau cho duyet',
        },
        value: formatPlainValue(systemSummaryData?.pendingOnboardingCount, summaryLoading),
      },
    ],
    badge: resolveText(summaryLoading ? DASHBOARD_TEXT.syncing : DASHBOARD_TEXT.live, languageCode),
  },
  {
    key: 'system-static-options',
    title: {
      ko: '정적 사전',
      en: 'Static Dictionary',
      vi: 'Tu dien tinh',
    },
    description: {
      ko: '앱 전반에서 쓰는 정적 코드와 별칭 사전을 확인합니다.',
      en: 'Review the static codes and aliases used across the app.',
      vi: 'Kiểm tra cac ma tinh va alias duoc su dung trong toan bo ung dung.',
    },
    statusItems: [
      {
        key: 'static-option-group-count',
        label: {
          ko: '그룹 수',
          en: 'Groups',
          vi: 'So nhom',
        },
        value: formatPlainValue(STATIC_OPTION_GROUPS.length, false),
      },
      {
        key: 'static-option-item-count',
        label: {
          ko: '항목 수',
          en: 'Items',
          vi: 'So muc',
        },
        value: formatPlainValue(countStaticOptionItems(), false),
      },
    ],
    badge: resolveText(DASHBOARD_TEXT.slotStatus, languageCode),
  },
];

const buildQuickActions = (languageCode, isSystemProfile) =>
  isSystemProfile
    ? [
        {
          path: '/system-setting/access-policy',
          label: getUiMessage('menu.accessPolicy', 'Access Policy', languageCode),
          icon: <TuneIcon fontSize="small" />,
        },
        {
          path: '/system-onboarding',
          label: getUiMessage('menu.onboardingApproval', 'Onboarding Approval', languageCode),
          icon: <GroupIcon fontSize="small" />,
        },
        {
          path: '/system-setting/static-options',
          label: getUiMessage('menu.staticOptions', 'Static Dictionary', languageCode),
          icon: <DnsIcon fontSize="small" />,
        },
      ]
    : [
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

const buildNotificationItems = ({ languageCode, isSystemProfile, summaryData, systemSummaryData }) => {
  const candidates = isSystemProfile
    ? [{ key: 'onboarding', count: systemSummaryData?.pendingOnboardingCount, path: '/system-onboarding', label: { ko: '가입 승인 대기', en: 'Pending onboarding requests', vi: 'Yêu cầu đăng ký chờ duyệt' } }]
    : [
        { key: 'employees', count: summaryData?.pendingEmployeeCount, path: '/employee', label: { ko: '승인 대기 직원', en: 'Employees awaiting approval', vi: 'Nhân viên chờ phê duyệt' } },
        { key: 'line-workers', count: summaryData?.unassignedLineWorkerCount, path: '/line', label: { ko: '라인 미배정 작업자', en: 'Workers without a line', vi: 'Công nhân chưa được xếp chuyền' } },
        { key: 'sales-prices', count: summaryData?.missingSalesPriceCustomerCount, path: '/customer', label: { ko: '판매단가 미설정 고객사', en: 'Customers missing sales prices', vi: 'Khách hàng chưa có đơn giá bán' } },
      ];
  return candidates
    .filter((item) => Number(item.count) > 0)
    .map((item) => ({ ...item, countLabel: languageCode === 'ko' ? `${item.count}건` : String(item.count) }));
};

const WorkspaceDashboard = () => {
  const { languageCode } = useLanguage();
  const { navigateToPath, showNotification } = useAppActions();
  const {
    isAuthenticated,
    devBypass,
    devProfile,
    accessProfile,
    activeOrgId,
    activeProfile,
  } = useAuth();
  const [summaryData, setSummaryData] = useState(() => createEmptySummary());
  const [systemSummaryData, setSystemSummaryData] = useState(() =>
    createEmptySystemSummary()
  );
  const [summaryLoading, setSummaryLoading] = useState(false);
  const isSystemProfile = activeProfile?.entryType === 'SYSTEM';

  const authState = useMemo(
    () => ({
      isAuthenticated,
      devBypass,
      devProfile,
      accessProfile,
    }),
    [accessProfile, devBypass, devProfile, isAuthenticated]
  );
  const canViewEmployee = canAccessPath('/employee', authState);
  const canViewLine = canAccessPath('/line', authState);
  const canViewCustomer = canAccessPath('/customer', authState);

  const loadSummaryData = useCallback(
    async ({ forceRefresh = false, cancelledRef = null } = {}) => {
      if (isSystemProfile) {
        if (!cancelledRef?.current) {
          setSummaryLoading(true);
        }

        try {
          const data = await requestJSON('/system/onboarding-requests', {
            forceRefresh,
            skipGlobalLoading: true,
          });
          const pendingOnboardingCount = Array.isArray(data?.pendingCompanyRequests)
            ? data.pendingCompanyRequests.length
            : 0;
          if (!cancelledRef?.current) {
            setSystemSummaryData({
              pendingOnboardingCount,
            });
          }
        } catch (error) {
          if (!cancelledRef?.current) {
            setSystemSummaryData(createEmptySystemSummary());
            showNotification(
              error?.message || resolveText(DASHBOARD_TEXT.summaryLoadError, languageCode),
              'error'
            );
          }
        } finally {
          if (!cancelledRef?.current) {
            setSummaryLoading(false);
          }
        }
        return;
      }

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
        const [orders, boardState, memberships, lineWorkers, customers] = await Promise.all([
          fetchOrders({ orgId: activeOrgId, forceRefresh }),
          requestJSON('/assignment-board-view' + boardQuery, {
            forceRefresh,
            skipGlobalLoading: true,
          }),
          canViewEmployee ? requestJSON(`/org-memberships${buildQueryString({ status: 'PENDING', orgId: activeOrgId })}`, { forceRefresh, skipGlobalLoading: true }).catch(() => []) : [],
          canViewLine ? requestJSON(`/line-workers${buildQueryString({ orgId: activeOrgId })}`, { forceRefresh, skipGlobalLoading: true }).catch(() => []) : [],
          canViewCustomer ? requestJSON(`/customers${buildQueryString({ orgId: activeOrgId })}`, { forceRefresh, skipGlobalLoading: true }).catch(() => []) : [],
        ]);
        if (!cancelledRef?.current) {
          const nextSummary = buildSummaryData({
              orders,
              assignments: Array.isArray(boardState?.assignments)
                ? boardState.assignments
                : [],
            });
          nextSummary.pendingEmployeeCount = Array.isArray(memberships) ? memberships.filter((item) => String(item?.status || '').toUpperCase() === 'PENDING').length : 0;
          nextSummary.unassignedLineWorkerCount = Array.isArray(lineWorkers) ? lineWorkers.filter((worker) => worker?.currentLineId == null).length : 0;
          nextSummary.missingSalesPriceCustomerCount = Array.isArray(customers) ? customers.filter((customer) => Number(customer?.missingSalesPriceStyleCount) > 0).length : 0;
          setSummaryData(nextSummary);
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
    [activeOrgId, canViewCustomer, canViewEmployee, canViewLine, isSystemProfile, languageCode, showNotification]
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
    isActive: !isSystemProfile,
    onRefresh: () => loadSummaryData({ forceRefresh: true }),
  });

  useEffect(() => {
    if (!activeOrgId || isSystemProfile) return undefined;
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
  }, [activeOrgId, isSystemProfile, loadSummaryData]);

  const summaryCards = useMemo(
    () =>
      isSystemProfile
        ? buildSystemSummaryCards({
            languageCode,
            summaryLoading,
            systemSummaryData,
          })
        : buildSummaryCards({
            languageCode,
            summaryData,
            summaryLoading,
          }),
    [isSystemProfile, languageCode, summaryData, summaryLoading, systemSummaryData]
  );

  const quickActions = useMemo(
    () =>
      buildQuickActions(languageCode, isSystemProfile).filter((item) =>
        canAccessPath(item.path, authState)
      ),
    [authState, isSystemProfile, languageCode]
  );
  const notificationItems = useMemo(
    () => buildNotificationItems({ languageCode, isSystemProfile, summaryData, systemSummaryData }).filter((item) => canAccessPath(item.path, authState)),
    [authState, isSystemProfile, languageCode, summaryData, systemSummaryData]
  );

  return (
    <AppPageContainer title={resolveText(DASHBOARD_TEXT.title, languageCode)}>
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2.25 }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            {resolveText(
              isSystemProfile
                ? DASHBOARD_TEXT.systemSummaryTitle
                : DASHBOARD_TEXT.summaryTitle,
              languageCode
            )}
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
                sx={SUMMARY_CARD_SX}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ mb: 0.75 }}
                >
                  <Typography variant="subtitle2" sx={SUMMARY_TITLE_SX}>
                    {resolveText(card.title, languageCode)}
                  </Typography>
                  <Chip
                    label={card.badge}
                    size="small"
                    variant="outlined"
                    sx={SUMMARY_BADGE_SX}
                  />
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
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={SUMMARY_LABEL_SX}
                        >
                          {resolveText(status.label, languageCode)}
                        </Typography>
                        <Typography variant="body2" sx={SUMMARY_VALUE_SX}>
                          {status.value}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body2" sx={SUMMARY_VALUE_SX}>
                    {card.value}
                  </Typography>
                )}
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={SUMMARY_DESCRIPTION_SX}
                >
                  {resolveText(card.description, languageCode)}
                </Typography>
              </Paper>
            ))}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.25 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <NotificationsNoneIcon color="primary" />
            <Typography variant="h6">{resolveText(DASHBOARD_TEXT.notificationTitle, languageCode)}</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{resolveText(DASHBOARD_TEXT.notificationDescription, languageCode)}</Typography>
          {summaryLoading ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1.5 }}>
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">{resolveText(DASHBOARD_TEXT.syncing, languageCode)}</Typography>
            </Stack>
          ) : notificationItems.length === 0 ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1.5, bgcolor: 'success.50', borderRadius: 1 }}>
              <CheckCircleOutlineIcon color="success" fontSize="small" />
              <Typography variant="body2">{resolveText(DASHBOARD_TEXT.notificationEmpty, languageCode)}</Typography>
            </Stack>
          ) : (
            <Stack spacing={1}>
              {notificationItems.map((item) => (
                <Button key={item.key} variant="outlined" color="warning" onClick={() => navigateToPath(item.path)} sx={{ justifyContent: 'space-between', px: 1.5, py: 1, textTransform: 'none' }}>
                  <Typography variant="body2" fontWeight={600}>{resolveText(item.label, languageCode)}</Typography>
                  <Chip size="small" color="warning" label={item.countLabel} />
                </Button>
              ))}
            </Stack>
          )}
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

      </Stack>
    </AppPageContainer>
  );
};

export default WorkspaceDashboard;
