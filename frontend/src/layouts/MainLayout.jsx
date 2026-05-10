import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppActions, useAppState } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import {
  AppBar,
  Toolbar,
  Button,
  Box,
  CircularProgress,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
  Collapse,
  Tabs,
  Tab,
  Badge,
  Fade,
  Stack,
  Typography,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ProductionQuantityLimitsIcon from '@mui/icons-material/ProductionQuantityLimits';
import OrganizationIcon from '@mui/icons-material/AccountTree';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BusinessIcon from '@mui/icons-material/Business';
import GroupIcon from '@mui/icons-material/Group';
import TuneIcon from '@mui/icons-material/Tune';
import LogoutIcon from '@mui/icons-material/Logout';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PeopleIcon from '@mui/icons-material/People';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import StyleIcon from '@mui/icons-material/Style';
import HistoryIcon from '@mui/icons-material/History';
import CloseIcon from '@mui/icons-material/Close';
import DnsIcon from '@mui/icons-material/Dns';
import ContentCut from '@mui/icons-material/ContentCut';
import TimelineIcon from '@mui/icons-material/Timeline';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ListAltIcon from '@mui/icons-material/ListAlt';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CalculateIcon from '@mui/icons-material/Calculate';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import DashboardIcon from '@mui/icons-material/Dashboard';
import { buildQueryString, cancelAllTrackedRequests, requestJSON } from '../utils/apiClient';
import { canAccessPath, resolveFirstAccessiblePath } from '../utils/accessControl';
import { getUiMessage } from '../constants/uiMessages';
import LanguageSwitcher from '../components/LanguageSwitcher';
import useNetworkLoading from '../hooks/useNetworkLoading';
import { RequestScopeBoundary } from '../context/RequestScopeContext';

const DRAWER_WIDTH = 260;
const TAB_BAR_HEIGHT = 41;
const EMPTY_WORKSPACE_PATH = '/workspace';
const EMPTY_WORKSPACE_HINT = {
  ko: '메뉴를 이용하세요.',
  en: 'Use the menu to continue.',
  vi: 'Hay su dung menu.',
};
const ORG_MEMBERSHIPS_UPDATED_EVENT = 'baro:org-memberships-updated';
const DAILY_WORK_HISTORY_LABELS = {
  ko: '\uC77C\uC77C \uAE30\uB85D',
  en: 'Daily Records',
  vi: 'Ghi chep ngay',
};
const MONTHLY_WORK_HISTORY_LABELS = {
  ko: '\uC6D4\uAC04 \uAE30\uB85D',
  en: 'Monthly Records',
  vi: 'Ghi chep thang',
};
const OPERATIONS_MANAGEMENT_LABELS = {
  ko: '\uC6B4\uC601 \uAD00\uB9AC',
  en: 'Operations',
  vi: 'Quan ly van hanh',
};
const PRODUCTION_MANAGEMENT_LABELS = {
  ko: '\uC0DD\uC0B0 \uAD00\uB9AC',
  en: 'Production',
  vi: 'Quan ly san xuat',
};
const SITUATION_BOARD_LABELS = {
  ko: '\uC0C1\uD669\uD310',
  en: 'Situation Board',
  vi: 'Bang tinh hinh',
};
const DASHBOARD_LABELS = {
  ko: '\uB300\uC2DC\uBCF4\uB4DC',
  en: 'Dashboard',
  vi: 'Bang dieu khien',
};
const MENU_GROUP_KEYS = {
  ORDER: 'ORDER',
  PRODUCTION: 'PRODUCTION',
  RECORDS: 'RECORDS',
  INVENTORY: 'INVENTORY',
  ACCOUNTING: 'ACCOUNTING',
  ADMIN: 'ADMIN',
  MISC: 'MISC',
  ATTRIBUTE: 'ATTRIBUTE',
  SYSTEM: 'SYSTEM',
};

const toPathname = (path) => {
  const raw = typeof path === 'string' ? path.trim() : '';
  if (!raw) return '/';
  const withoutHash = raw.split('#')[0];
  const pathname = withoutHash.split('?')[0];
  const normalizedPathname = pathname.replace(/\/+$/, '');
  return normalizedPathname || '/';
};
const isKeepAliveCandidatePath = (path) => {
  const pathname = toPathname(path);
  if (!pathname || pathname === '/') return false;
  if (pathname === '/login') return false;
  if (pathname.startsWith('/auth')) return false;
  return true;
};

const resolveLocalizedLabel = (bundle, languageCode) =>
  bundle?.[languageCode] || bundle?.ko || '';

const resolveNameFromEmail = (email) => {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalized || !normalized.includes('@')) return '';
  return normalized.split('@')[0];
};

const buildTabLoadingCounts = (scopes = []) => {
  const next = new Map();
  (scopes || []).forEach((entry) => {
    if (entry?.groupId !== 'workspace') return;
    const rootScopeId = String(entry?.scopeId || '').split('::')[0];
    const tabId = toPathname(rootScopeId);
    if (!tabId || tabId === '/') return;
    const activeRequestCount = Number(entry?.activeRequestCount) || 0;
    if (activeRequestCount <= 0) return;
    next.set(tabId, (next.get(tabId) || 0) + activeRequestCount);
  });
  return next;
};

const WorkspaceTabsBar = React.memo(function WorkspaceTabsBar({
  currentPath,
  pendingTabPath,
  tabsForRender,
  onTabChange,
  onCloseTab,
  resolveRenderedTabLabel,
}) {
  const networkLoading = useNetworkLoading();
  const tabLoadingCounts = useMemo(
    () => buildTabLoadingCounts(networkLoading.scopes),
    [networkLoading.scopes]
  );
  const activeTabValue = tabsForRender.some((tab) => tab.id === currentPath)
    ? currentPath
    : false;

  if (tabsForRender.length === 0) {
    return (
      <Box
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: '#f4f6f8',
          minHeight: `${TAB_BAR_HEIGHT}px`,
          height: `${TAB_BAR_HEIGHT}px`,
        }}
      />
    );
  }

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#f4f6f8' }}>
      <Tabs
        value={activeTabValue}
        onChange={onTabChange}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="open pages tabs"
        sx={{
          minHeight: '40px',
          '& .MuiTabs-indicator': {
            height: '2px',
          },
        }}
      >
        {tabsForRender.map((tab) => {
          const isTabLoading =
            (tabLoadingCounts.get(tab.id) || 0) > 0 || pendingTabPath === tab.id;

          return (
            <Tab
              key={tab.id}
              value={tab.id}
              component="div"
              sx={{
                minHeight: '40px',
                textTransform: 'none',
                borderRight: 1,
                borderColor: 'divider',
                opacity: 1,
                '&.Mui-selected': {
                  bgcolor: 'white',
                  fontWeight: 'bold',
                },
                '&:not(.Mui-selected)': {
                  bgcolor: '#f4f6f8',
                },
                '& .MuiTab-wrapper': {
                  flexDirection: 'row',
                },
                p: '0 16px',
                minWidth: '120px',
              }}
              label={
                <Box component="span" sx={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem' }}>
                  {resolveRenderedTabLabel(tab)}
                  {isTabLoading && (
                    <Box component="span" sx={{ display: 'inline-flex', ml: 0.75, color: 'text.secondary' }}>
                      <CircularProgress size={13} thickness={5} color="inherit" />
                    </Box>
                  )}
                  {!tab.isOptimistic && (
                    <IconButton
                      component="span"
                      size="small"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => onCloseTab(e, tab.id)}
                      sx={{
                        ml: 1,
                        mr: -1.5,
                        p: '2px',
                        '&:hover': {
                          bgcolor: 'rgba(0, 0, 0, 0.08)',
                        },
                      }}
                    >
                      <CloseIcon sx={{ fontSize: '1rem' }} />
                    </IconButton>
                  )}
                </Box>
              }
            />
          );
        })}
      </Tabs>
    </Box>
  );
});

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routeOutlet = useOutlet();
  const currentPath = location.pathname || '/';
  const currentRoutePath = `${location.pathname || '/'}${location.search || ''}${location.hash || ''}`;
  const {
    signOut,
    devBypass,
    devProfile,
    accessProfile,
    activeOrgId,
    isAuthenticated,
    user,
    activeProfile,
  } = useAuth();
  const {
    sidebarOpen,
    openTabs,
    notification,
  } = useAppState();
  const {
    toggleSidebar,
    setSidebarOpen,
    openTab,
    closeTab,
    resetWorkspace,
    setNavigateToPath,
    confirmDiscardUnsavedChanges,
  } = useAppActions();
  const { languageCode, setLanguageCode } = useLanguage();

  const [mountedTabOutlets, setMountedTabOutlets] = useState(() => {
    if (!isKeepAliveCandidatePath(currentPath) || !routeOutlet) return new Map();
    return new Map([[currentPath, routeOutlet]]);
  });

  const [adminOpen, setAdminOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [productionOpen, setProductionOpen] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [accountingOpen, setAccountingOpen] = useState(false);
  const [miscOpen, setMiscOpen] = useState(false);
  const [attributeOpen, setAttributeOpen] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
  const [pendingEmployeeCount, setPendingEmployeeCount] = useState(0);
  const [pendingOnboardingCount, setPendingOnboardingCount] = useState(0);
  const [pendingTabPath, setPendingTabPath] = useState('');
  const [headerHeight, setHeaderHeight] = useState(64);
  const appBarRef = useRef(null);
  const skipAutoOpenPathRef = useRef(null);
  const isLoggingOutRef = useRef(false);
  const pendingNavigationPathRef = useRef(null);
  const pendingCloseTabRef = useRef(null);
  const pendingManualTabCloseRef = useRef(null);
  const currentPathRef = useRef(currentPath);
  const recentTabHistoryRef = useRef([]);
  const headerOffset = `${Math.max(56, Math.round(headerHeight || 64))}px`;

  const setExpandedMenuGroup = React.useCallback((menuGroupKey) => {
    setOrderOpen(menuGroupKey === MENU_GROUP_KEYS.ORDER);
    setProductionOpen(menuGroupKey === MENU_GROUP_KEYS.PRODUCTION);
    setRecordsOpen(menuGroupKey === MENU_GROUP_KEYS.RECORDS);
    setInventoryOpen(menuGroupKey === MENU_GROUP_KEYS.INVENTORY);
    setAccountingOpen(menuGroupKey === MENU_GROUP_KEYS.ACCOUNTING);
    setAdminOpen(menuGroupKey === MENU_GROUP_KEYS.ADMIN);
    setMiscOpen(menuGroupKey === MENU_GROUP_KEYS.MISC);
    setAttributeOpen(menuGroupKey === MENU_GROUP_KEYS.ATTRIBUTE);
    setSystemOpen(menuGroupKey === MENU_GROUP_KEYS.SYSTEM);
  }, []);

  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  useEffect(() => {
    if (currentPath.startsWith('/attribute')) {
      setExpandedMenuGroup(MENU_GROUP_KEYS.ATTRIBUTE);
      return;
    }
    if (
      currentPath.startsWith('/system-setting') ||
      currentPath.startsWith('/system-onboarding')
    ) {
      setExpandedMenuGroup(MENU_GROUP_KEYS.SYSTEM);
    }
  }, [currentPath, setExpandedMenuGroup]);

  useEffect(() => {
    const element = appBarRef.current;
    if (!element) return undefined;

    const updateHeight = () => {
      const nextHeight = element.getBoundingClientRect().height;
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;
      setHeaderHeight((prev) => (Math.abs(prev - nextHeight) < 1 ? prev : nextHeight));
    };

    updateHeight();

    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateHeight();
      });
      resizeObserver.observe(element);
    }

    window.addEventListener('resize', updateHeight);

    return () => {
      window.removeEventListener('resize', updateHeight);
      resizeObserver?.disconnect();
    };
  }, []);

  const schedulePendingNavigationCleanup = React.useCallback((sourcePath, nextPathname) => {
    window.setTimeout(() => {
      if (pendingNavigationPathRef.current !== nextPathname) return;
      const browserPath = toPathname(window.location.pathname || '/');
      if (browserPath !== sourcePath) return;
      if (pendingCloseTabRef.current) return;
      pendingNavigationPathRef.current = null;
      pendingCloseTabRef.current = null;
    }, 0);
  }, []);
  const authState = useMemo(
    () => ({
      isAuthenticated,
      devBypass,
      devProfile,
      accessProfile,
    }),
    [accessProfile, devBypass, devProfile, isAuthenticated]
  );
  const hasPathAccess = React.useCallback(
    (path) => canAccessPath(path, authState),
    [authState]
  );
  const resolveAccessiblePath = React.useCallback(
    (options) => resolveFirstAccessiblePath(authState, options),
    [authState]
  );
  const canViewEmployeeMenu = hasPathAccess('/employee');
  const canViewSystemOnboardingMenu = hasPathAccess('/system-onboarding');
  const isSystemProfile = activeProfile?.entryType === 'SYSTEM';
  const activeOrgName = useMemo(() => {
    const orgName =
      typeof activeProfile?.orgName === 'string' ? activeProfile.orgName.trim() : '';
    if (orgName) return orgName;
    if (activeProfile?.entryType === 'SYSTEM') return 'SYSTEM';
    return '';
  }, [activeProfile?.entryType, activeProfile?.orgName]);
  const activeUserName = useMemo(() => {
    const nameFromProfile =
      typeof activeProfile?.employeeName === 'string'
        ? activeProfile.employeeName.trim()
        : '';
    if (nameFromProfile) return nameFromProfile;

    const metadataCandidates = [
      user?.user_metadata?.name,
      user?.user_metadata?.full_name,
      user?.user_metadata?.nickname,
    ];
    const metadataName = metadataCandidates.find(
      (candidate) => typeof candidate === 'string' && candidate.trim()
    );
    if (typeof metadataName === 'string' && metadataName.trim()) {
      return metadataName.trim();
    }

    const fallbackEmail = activeProfile?.email || user?.email || '';
    return resolveNameFromEmail(fallbackEmail);
  }, [activeProfile?.email, activeProfile?.employeeName, user?.email, user?.user_metadata]);
  const activeUserSummary = useMemo(() => activeUserName || '', [activeUserName]);

  const fetchPendingEmployeeCount = React.useCallback(async () => {
    if (!canViewEmployeeMenu) {
      setPendingEmployeeCount(0);
      return;
    }
    try {
      const data = await requestJSON(
        `/org-memberships${buildQueryString({
          status: 'PENDING',
          orgId: activeOrgId,
        })}`,
        { skipGlobalLoading: true }
      );
      const pendingCount = Array.isArray(data)
        ? data.filter((item) => String(item?.status || '').toUpperCase() === 'PENDING').length
        : 0;
      setPendingEmployeeCount(pendingCount);
    } catch (_error) {
      setPendingEmployeeCount(0);
    }
  }, [activeOrgId, canViewEmployeeMenu]);

  const fetchPendingOnboardingCount = React.useCallback(async () => {
    if (!canViewSystemOnboardingMenu) {
      setPendingOnboardingCount(0);
      return;
    }
    try {
      const data = await requestJSON('/system/onboarding-requests', {
        skipGlobalLoading: true,
      });
      const rows = Array.isArray(data?.pendingCompanyRequests)
        ? data.pendingCompanyRequests
        : [];
      setPendingOnboardingCount(rows.length);
    } catch (_error) {
      // ignore fetch errors for badge
    }
  }, [canViewSystemOnboardingMenu]);

  const menuItems = useMemo(() => {
    const baseItems = [
      {
        label: resolveLocalizedLabel(DASHBOARD_LABELS, languageCode),
        icon: <DashboardIcon />,
        path: '/workspace',
      },
      {
        label: getUiMessage('menu.sales', '\uC601\uC5C5 \uAD00\uB9AC', languageCode),
        icon: <ShoppingCartIcon />,
        isParent: true,
        menuGroupKey: MENU_GROUP_KEYS.ORDER,
        isOpen: orderOpen,
        children: [
          {
            label: getUiMessage('menu.order', '\uC8FC\uBB38', languageCode),
            icon: <ListAltIcon />,
            path: '/order',
          },
          {
            label: getUiMessage('menu.style', '\uC2A4\uD0C0\uC77C', languageCode),
            icon: <StyleIcon />,
            path: '/style',
          },
        ],
      },
      {
        label: resolveLocalizedLabel(OPERATIONS_MANAGEMENT_LABELS, languageCode),
        icon: <ProductionQuantityLimitsIcon />,
        isParent: true,
        menuGroupKey: MENU_GROUP_KEYS.PRODUCTION,
        isOpen: productionOpen,
        children: [
          {
            label: getUiMessage('menu.line', '\uB77C\uC778', languageCode),
            icon: <ContentCut />,
            path: '/line',
          },
          {
            label: getUiMessage('menu.assignment', '\uBC30\uC815', languageCode),
            icon: <ContentCut />,
            path: '/assignment',
          },
          {
            label: resolveLocalizedLabel(SITUATION_BOARD_LABELS, languageCode),
            icon: <TimelineIcon />,
            path: '/production-plan',
            disabled: true,
          },
          {
            label: getUiMessage(
              'menu.standardReview',
              '\uD45C\uC900 \uACF5\uC784 \uAC80\uD1A0',
              languageCode
            ),
            icon: <FactCheckIcon />,
            path: '/st-review',
            disabled: true,
          },
          {
            label: getUiMessage('menu.shipmentReview', '\uC218\uB7C9 \uC815\uC0B0', languageCode),
            icon: <LocalShippingIcon />,
            path: '/shipment-review',
          },
        ],
      },
      {
        label: resolveLocalizedLabel(PRODUCTION_MANAGEMENT_LABELS, languageCode),
        icon: <HistoryIcon />,
        isParent: true,
        menuGroupKey: MENU_GROUP_KEYS.RECORDS,
        isOpen: recordsOpen,
        children: [
          {
            label: getUiMessage('menu.workHistory', '\uAE30\uB85D', languageCode),
            icon: <HistoryIcon />,
            path: '/work-history',
          },
          {
            label: getUiMessage('menu.workHistoryMonthly', '\uC6D4\uAC04 \uAE30\uB85D', languageCode),
            icon: <HistoryIcon />,
            path: '/work-history-monthly',
          },
          {
            label: getUiMessage('menu.attendance', '\uCD9C\uD1F4\uADFC', languageCode),
            icon: <ScheduleIcon />,
            path: '/attendance',
          },
        ],
      },
      {
        label: getUiMessage('menu.inventory', '\uC7AC\uACE0 \uAD00\uB9AC', languageCode),
        icon: <Inventory2Icon />,
        isParent: true,
        menuGroupKey: MENU_GROUP_KEYS.INVENTORY,
        isOpen: inventoryOpen,
        children: [
          {
            label: getUiMessage('menu.inventoryIssue', '\uC7AC\uACE0 \uBD88\uCD9C', languageCode),
            icon: <Inventory2Icon />,
            path: '/inventory',
            disabled: true,
          },
        ],
      },
      {
        label: getUiMessage('menu.accounting', '\uD68C\uACC4 \uAD00\uB9AC', languageCode),
        icon: <AccountBalanceWalletIcon />,
        isParent: true,
        menuGroupKey: MENU_GROUP_KEYS.ACCOUNTING,
        isOpen: accountingOpen,
        children: [
          {
            label: getUiMessage('menu.payroll', '\uAE09\uC5EC \uACC4\uC0B0', languageCode),
            icon: <CalculateIcon />,
            path: '/payroll',
          },
          {
            label: getUiMessage('menu.productionResult', '\uC0DD\uC0B0 \uACB0\uACFC', languageCode),
            icon: <ListAltIcon />,
            path: '/production-result',
            disabled: true,
          },
        ],
      },
      {
        label: getUiMessage('menu.organization', '\uC870\uC9C1 \uAD00\uB9AC', languageCode),
        icon: <OrganizationIcon />,
        isParent: true,
        menuGroupKey: MENU_GROUP_KEYS.ADMIN,
        isOpen: adminOpen,
        children: [
          {
            label: getUiMessage('menu.business', '\uC0AC\uC5C5\uCCB4 \uAD00\uB9AC', languageCode),
            icon: <BusinessIcon />,
            path: '/business',
          },
          {
            label: getUiMessage('menu.employee', '\uC9C1\uC6D0 \uAD00\uB9AC', languageCode),
            icon: <GroupIcon />,
            path: '/employee',
            badgeCount: pendingEmployeeCount,
          },
          {
            label: getUiMessage('menu.customer', '\uACE0\uAC1D \uAD00\uB9AC', languageCode),
            icon: <PeopleIcon />,
            path: '/customer',
          },
          {
            label: getUiMessage('menu.subscription', '\uAD6C\uB3C5 \uAD00\uB9AC', languageCode),
            icon: <TuneIcon />,
            path: '/system-setting',
          },
        ],
      },
      {
        label: getUiMessage('menu.misc', '\uAE30\uD0C0 \uAD00\uB9AC', languageCode),
        icon: <MoreHorizIcon />,
        isParent: true,
        menuGroupKey: MENU_GROUP_KEYS.MISC,
        isOpen: miscOpen,
        children: [
          {
            label: getUiMessage('menu.holiday', '\uD734\uC77C \uAD00\uB9AC', languageCode),
            icon: <CalendarMonthIcon />,
            path: '/holiday',
          },
        ],
      },
      {
        label: getUiMessage('menu.attribute', '\uC18D\uC131 \uAD00\uB9AC', languageCode),
        icon: <DnsIcon />,
        isParent: true,
        menuGroupKey: MENU_GROUP_KEYS.ATTRIBUTE,
        isOpen: attributeOpen,
        children: [
          ...(isSystemProfile
            ? [
                {
                  label: getUiMessage(
                    'menu.attributeColors',
                    '\uC0C9\uC0C1 \uAD00\uB9AC',
                    languageCode
                  ),
                  icon: <DnsIcon />,
                  path: '/attribute/colors',
                },
                {
                  label: getUiMessage(
                    'menu.attributeCategories',
                    '\uCE74\uD14C\uACE0\uB9AC \uAD00\uB9AC',
                    languageCode
                  ),
                  icon: <DnsIcon />,
                  path: '/attribute/categories',
                },
              ]
            : []),
          {
            label: getUiMessage('menu.attributeProcesses', '\uACF5\uC815 \uAD00\uB9AC', languageCode),
            icon: <DnsIcon />,
            path: '/attribute/processes',
          },
        ],
      },
      {
        label: getUiMessage('menu.system', '\uC2DC\uC2A4\uD15C \uC124\uC815', languageCode),
        icon: <TuneIcon />,
        isParent: true,
        menuGroupKey: MENU_GROUP_KEYS.SYSTEM,
        isOpen: systemOpen,
        children: [
          {
            label: getUiMessage('menu.staticOptions', '\uC815\uC801 \uC0AC\uC804', languageCode),
            icon: <DnsIcon />,
            path: '/system-setting/static-options',
          },
          {
            label: getUiMessage('menu.onboardingApproval', '\uAC00\uC785 \uC2B9\uC778', languageCode),
            icon: <GroupIcon />,
            path: '/system-onboarding',
            badgeLabel:
              pendingOnboardingCount > 0
                ? getUiMessage('common.new', '\uC2E0\uADDC', languageCode)
                : '',
          },
        ],
      },
    ];

    const customerMenuItem = {
      label: getUiMessage('menu.customer', '\uACE0\uAC1D', languageCode),
      icon: <PeopleIcon />,
      path: '/customer',
    };

    return baseItems
      .map((item) => {
        if (!item.isParent) {
          return hasPathAccess(item.path) ? item : null;
        }
        let visibleChildren = item.children.filter((child) =>
          hasPathAccess(child.path)
        );
        visibleChildren = visibleChildren.map((child) =>
          child.path === '/work-history'
            ? {
                ...child,
                label: getUiMessage(
                  'menu.workHistoryDaily',
                  resolveLocalizedLabel(DAILY_WORK_HISTORY_LABELS, languageCode),
                  languageCode
                ),
              }
            : child.path === '/work-history-monthly'
              ? {
                  ...child,
                  label: getUiMessage(
                    'menu.workHistoryMonthly',
                    resolveLocalizedLabel(MONTHLY_WORK_HISTORY_LABELS, languageCode),
                    languageCode
                  ),
                }
              : child
        );
        const childPaths = new Set(item.children.map((child) => child.path));

        if (childPaths.has('/order') && childPaths.has('/style')) {
          visibleChildren = [
            hasPathAccess(customerMenuItem.path) ? customerMenuItem : null,
            visibleChildren.find((child) => child.path === '/style') || null,
            visibleChildren.find((child) => child.path === '/order') || null,
            ...visibleChildren.filter(
              (child) => !['/customer', '/style', '/order'].includes(child.path)
            ),
          ].filter(Boolean);
        }

        if (childPaths.has('/assignment')) {
          const preferredProductionPaths = [
            '/line',
            '/assignment',
            '/production-plan',
            '/st-review',
            '/shipment-review',
          ];
          visibleChildren = [
            ...preferredProductionPaths.map(
              (path) => visibleChildren.find((child) => child.path === path) || null
            ),
            ...visibleChildren.filter(
              (child) => !preferredProductionPaths.includes(child.path)
            ),
          ].filter(Boolean);
        }

        if (childPaths.has('/employee')) {
          visibleChildren = visibleChildren.filter((child) => child.path !== '/customer');
        }

        if (childPaths.has('/work-history') && childPaths.has('/attendance')) {
          const preferredRecordPaths = [
            '/work-history',
            '/work-history-monthly',
            '/attendance',
          ];
          visibleChildren = [
            ...preferredRecordPaths.map(
              (path) => visibleChildren.find((child) => child.path === path) || null
            ),
            ...visibleChildren.filter(
              (child) => !preferredRecordPaths.includes(child.path)
            ),
          ].filter(Boolean);
        }

        if (visibleChildren.length === 0) return null;
        return {
          ...item,
          children: visibleChildren,
        };
      })
      .filter(Boolean);
  }, [
    accountingOpen,
    adminOpen,
    attributeOpen,
    hasPathAccess,
    inventoryOpen,
    languageCode,
    miscOpen,
    orderOpen,
    pendingEmployeeCount,
    pendingOnboardingCount,
    productionOpen,
    recordsOpen,
    isSystemProfile,
    systemOpen,
  ]);
  const flattenedMenuItems = useMemo(
    () =>
      menuItems.flatMap((item) =>
        item.isParent ? item.children : [item]
      ),
    [menuItems]
  );
  const resolveWorkHistoryTabLabel = React.useCallback(
    (kind = 'list') => {
      const baseLabel = getUiMessage(
        'menu.workHistoryDaily',
        resolveLocalizedLabel(DAILY_WORK_HISTORY_LABELS, languageCode),
        languageCode
      );
      const suffixByKind =
        languageCode === 'ko'
          ? { list: '\uBAA9\uB85D', new: '\uC2E0\uADDC', detail: '\uC0C1\uC138' }
          : languageCode === 'vi'
            ? { list: 'Danh sach', new: 'Moi', detail: 'Chi tiet' }
            : { list: 'List', new: 'New', detail: 'Detail' };
      if (kind === 'new') return `${baseLabel} - ${suffixByKind.new}`;
      if (kind === 'detail') return `${baseLabel} - ${suffixByKind.detail}`;
      return `${baseLabel} - ${suffixByKind.list}`;
    },
    [languageCode]
  );
  const resolveWorkHistoryMonthlyTabLabel = React.useCallback(
    (kind = 'list') => {
      const baseLabel = getUiMessage(
        'menu.workHistoryMonthly',
        resolveLocalizedLabel(MONTHLY_WORK_HISTORY_LABELS, languageCode),
        languageCode
      );
      const suffixByKind =
        languageCode === 'ko'
          ? { list: '\uBAA9\uB85D', detail: '\uC0C1\uC138' }
          : languageCode === 'vi'
            ? { list: 'Danh sach', detail: 'Chi tiet' }
            : { list: 'List', detail: 'Detail' };
      if (kind === 'detail') return `${baseLabel} - ${suffixByKind.detail}`;
      return `${baseLabel} - ${suffixByKind.list}`;
    },
    [languageCode]
  );
  const resolveAttendanceTabLabel = React.useCallback(
    (kind = 'list') => {
      const baseLabel = getUiMessage('menu.attendance', 'Attendance', languageCode);
      const suffixByKind =
        languageCode === 'ko'
          ? { list: '\uBAA9\uB85D', new: '\uC2E0\uADDC', detail: '\uC0C1\uC138' }
          : languageCode === 'vi'
            ? { list: 'Danh sach', new: 'Moi', detail: 'Chi tiet' }
            : { list: 'List', new: 'New', detail: 'Detail' };
      if (kind === 'new') return `${baseLabel} - ${suffixByKind.new}`;
      if (kind === 'detail') return `${baseLabel} - ${suffixByKind.detail}`;
      return `${baseLabel} - ${suffixByKind.list}`;
    },
    [languageCode]
  );
  const resolveTabLabel = React.useCallback(
    (path) => {
      if (path === '/profile') {
        return getUiMessage('menu.profile', 'Profile', languageCode);
      }
      if (path === '/work-history') {
        return resolveWorkHistoryTabLabel('list');
      }
      if (path === '/work-history/new') {
        return resolveWorkHistoryTabLabel('new');
      }
      if (path.startsWith('/work-history/') && path !== '/work-history') {
        return resolveWorkHistoryTabLabel('detail');
      }
      if (path === '/work-history-monthly') {
        return resolveWorkHistoryMonthlyTabLabel('list');
      }
      if (path.startsWith('/work-history-monthly/') && path !== '/work-history-monthly') {
        return resolveWorkHistoryMonthlyTabLabel('detail');
      }
      if (path === '/attendance') {
        return resolveAttendanceTabLabel('list');
      }
      if (path === '/attendance/new') {
        return resolveAttendanceTabLabel('new');
      }
      if (path.startsWith('/attendance/') && path !== '/attendance') {
        return resolveAttendanceTabLabel('detail');
      }
      const matchedMenu =
        flattenedMenuItems.find((item) => item.path === path) ||
        flattenedMenuItems.find((item) => path.startsWith(item.path + '/'));
      return matchedMenu?.label || path;
    },
    [
      flattenedMenuItems,
      languageCode,
      resolveAttendanceTabLabel,
      resolveWorkHistoryMonthlyTabLabel,
      resolveWorkHistoryTabLabel,
    ]
  );
  const resolveRenderedTabLabel = React.useCallback(
    (tab) => {
      const tabPath = toPathname(tab?.id || tab?.path || '');
      if (!tabPath) return tab?.label || '';

      if (tabPath === '/profile') {
        return getUiMessage('menu.profile', 'Profile', languageCode);
      }

      if (tabPath === '/work-history') {
        return resolveWorkHistoryTabLabel('list');
      }

      if (tabPath === '/work-history/new') {
        return resolveWorkHistoryTabLabel('new');
      }

      if (
        tabPath.startsWith('/work-history/') &&
        tabPath !== '/work-history' &&
        typeof tab?.label === 'string' &&
        tab.label.trim()
      ) {
        return tab.label;
      }
      if (tabPath.startsWith('/work-history/') && tabPath !== '/work-history') {
        return resolveWorkHistoryTabLabel('detail');
      }
      if (tabPath === '/work-history-monthly') {
        return resolveWorkHistoryMonthlyTabLabel('list');
      }
      if (
        tabPath.startsWith('/work-history-monthly/') &&
        tabPath !== '/work-history-monthly' &&
        typeof tab?.label === 'string' &&
        tab.label.trim()
      ) {
        return tab.label;
      }
      if (
        tabPath.startsWith('/work-history-monthly/') &&
        tabPath !== '/work-history-monthly'
      ) {
        return resolveWorkHistoryMonthlyTabLabel('detail');
      }
      if (tabPath === '/attendance') {
        return resolveAttendanceTabLabel('list');
      }
      if (tabPath === '/attendance/new') {
        return resolveAttendanceTabLabel('new');
      }
      if (
        tabPath.startsWith('/attendance/') &&
        tabPath !== '/attendance' &&
        typeof tab?.label === 'string' &&
        tab.label.trim()
      ) {
        return tab.label;
      }
      if (tabPath.startsWith('/attendance/') && tabPath !== '/attendance') {
        return resolveAttendanceTabLabel('detail');
      }

      const exactMenuItem = flattenedMenuItems.find((item) => item.path === tabPath);
      if (exactMenuItem?.label) return exactMenuItem.label;

      return tab?.label || '';
    },
    [
      flattenedMenuItems,
      languageCode,
      resolveAttendanceTabLabel,
      resolveWorkHistoryMonthlyTabLabel,
      resolveWorkHistoryTabLabel,
    ]
  );
  const tabsForRender = useMemo(() => {
    if (
      pendingNavigationPathRef.current &&
      pendingNavigationPathRef.current !== currentPath
    ) {
      return openTabs;
    }
    if (openTabs.some((tab) => tab.id === currentPath)) return openTabs;
    if (skipAutoOpenPathRef.current === currentPath) {
      return openTabs;
    }
    if (
      currentPath === '/' ||
      currentPath === '/login' ||
      currentPath.startsWith('/auth')
    ) {
      return openTabs;
    }

    return [
      ...openTabs,
      {
        id: currentPath,
        label: resolveTabLabel(currentPath),
        path: currentRoutePath,
        isOptimistic: true,
      },
    ];
  }, [currentPath, currentRoutePath, openTabs, resolveTabLabel]);
  useEffect(() => {
    if (!canViewEmployeeMenu) {
      setPendingEmployeeCount(0);
      return () => {};
    }
    fetchPendingEmployeeCount();
    const intervalId = setInterval(fetchPendingEmployeeCount, 30000);
    return () => clearInterval(intervalId);
  }, [canViewEmployeeMenu, fetchPendingEmployeeCount]);
  useEffect(() => {
    if (!canViewEmployeeMenu) return () => {};
    const activeOrgIdNumber = Number(activeOrgId);

    const handleMembershipUpdated = (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : null;
      const changedOrgId = Number(detail?.orgId);
      if (
        Number.isFinite(changedOrgId) &&
        Number.isFinite(activeOrgIdNumber) &&
        changedOrgId > 0 &&
        activeOrgIdNumber > 0 &&
        changedOrgId !== activeOrgIdNumber
      ) {
        return;
      }

      const pendingCount = Number(detail?.pendingCount);
      if (Number.isFinite(pendingCount) && pendingCount >= 0) {
        setPendingEmployeeCount(pendingCount);
        return;
      }
      fetchPendingEmployeeCount();
    };

    window.addEventListener(ORG_MEMBERSHIPS_UPDATED_EVENT, handleMembershipUpdated);
    return () => window.removeEventListener(ORG_MEMBERSHIPS_UPDATED_EVENT, handleMembershipUpdated);
  }, [activeOrgId, canViewEmployeeMenu, fetchPendingEmployeeCount]);
  useEffect(() => {
    if (!canViewSystemOnboardingMenu) {
      setPendingOnboardingCount(0);
      return () => {};
    }
    fetchPendingOnboardingCount();
    const intervalId = setInterval(fetchPendingOnboardingCount, 30000);
    return () => clearInterval(intervalId);
  }, [canViewSystemOnboardingMenu, fetchPendingOnboardingCount]);

  // The core navigation logic, wrapped in useCallback for stability.
  const handleNavigation = React.useCallback(
    (path, options) => {
      const requestedPath =
        typeof path === 'string' && path.trim() ? path : resolveAccessiblePath();
      const requestedPathname = toPathname(requestedPath);
      const nextPath = requestedPathname === '/' ? resolveAccessiblePath() : requestedPath;
      const nextPathname = toPathname(nextPath);

      if (!hasPathAccess(nextPathname)) {
        setPendingTabPath('');
        const fallbackPath = resolveAccessiblePath();
        if (currentPath !== fallbackPath) {
          navigate(fallbackPath, { replace: true });
        }
        return;
      }

      const openOptions = {};
      const closeTabId =
        typeof options?.closeTabId === 'string' && options.closeTabId.trim()
          ? toPathname(options.closeTabId)
          : null;
      const skipUnsavedChangesCheck = options?.skipUnsavedChangesCheck === true;
      const isSamePathNavigation = nextPathname === currentPath;
      if (!isSamePathNavigation && !skipUnsavedChangesCheck) {
        const confirmed = confirmDiscardUnsavedChanges({ path: currentPath });
        if (!confirmed) return;
      }
      if (!isSamePathNavigation) {
        // For style detail pages, ensure only one is open at a time.
        if (nextPathname.startsWith('/style/') && nextPathname !== '/style') {
          openOptions.replacePrefix = '/style/';
        }
        // For order detail pages, ensure only one is open at a time.
        if (nextPathname.startsWith('/order/') && nextPathname !== '/order') {
          openOptions.replacePrefix = '/order/';
        }
        // For work history detail pages, ensure only one detail tab is open.
        if (nextPathname.startsWith('/work-history/') && nextPathname !== '/work-history') {
          openOptions.replacePrefix = '/work-history/';
        }
        // For monthly work history detail pages, ensure only one detail tab is open.
        if (
          nextPathname.startsWith('/work-history-monthly/') &&
          nextPathname !== '/work-history-monthly'
        ) {
          openOptions.replacePrefix = '/work-history-monthly/';
        }
        // For attendance detail pages, ensure only one detail tab is open.
        if (nextPathname.startsWith('/attendance/') && nextPathname !== '/attendance') {
          openOptions.replacePrefix = '/attendance/';
        }
        // For payroll detail pages, ensure only one detail tab is open.
        if (nextPathname.startsWith('/payroll/') && nextPathname !== '/payroll') {
          openOptions.replacePrefix = '/payroll/';
        }
      }

      // The `openTab` function from context already checks for duplicates,
      // so we can call it directly. This removes the dependency on `openTabs`.
      let label = options?.label;
      if (!label) {
        label = resolveTabLabel(nextPathname);
      }
      openTab({ id: nextPathname, label, path: nextPath }, openOptions);

      if (nextPath && currentRoutePath !== nextPath) {
        setPendingTabPath(nextPathname);
        pendingCloseTabRef.current = closeTabId;
        pendingNavigationPathRef.current = nextPathname;
        navigate(nextPath);
        schedulePendingNavigationCleanup(currentPathRef.current, nextPathname);
      } else if (closeTabId && currentPath !== closeTabId) {
        const confirmed = confirmDiscardUnsavedChanges({ path: closeTabId });
        if (!confirmed) return;
        setPendingTabPath('');
        pendingCloseTabRef.current = null;
        closeTab(closeTabId);
      }
    },
    [
      closeTab,
      currentPath,
      currentRoutePath,
      confirmDiscardUnsavedChanges,
      hasPathAccess,
      navigate,
      openTab,
      resolveAccessiblePath,
      resolveTabLabel,
      schedulePendingNavigationCleanup,
    ]
  );

  useEffect(() => {
    if (pendingNavigationPathRef.current) {
      if (pendingNavigationPathRef.current !== currentPath) {
        return;
      }
      pendingNavigationPathRef.current = null;
      const pendingCloseTabId = pendingCloseTabRef.current;
      if (pendingCloseTabId && pendingCloseTabId !== currentPath) {
        pendingCloseTabRef.current = null;
        closeTab(pendingCloseTabId);
      }
    }

    const pendingManualClose = pendingManualTabCloseRef.current;
    if (pendingManualClose) {
      if (currentPath === pendingManualClose.targetPath) {
        pendingManualTabCloseRef.current = null;
        if (openTabs.some((tab) => tab.id === pendingManualClose.tabId)) {
          closeTab(pendingManualClose.tabId);
        }
      } else if (currentPath !== pendingManualClose.sourcePath) {
        pendingManualTabCloseRef.current = null;
      }
    }

    if (skipAutoOpenPathRef.current && currentPath !== skipAutoOpenPathRef.current) {
      skipAutoOpenPathRef.current = null;
    }

    if (isLoggingOutRef.current) return;
    if (
      currentPath === '/' ||
      currentPath === '/login' ||
      currentPath.startsWith('/auth')
    ) {
      return;
    }
    if (skipAutoOpenPathRef.current === currentPath) return;
    if (openTabs.some((tab) => tab.id === currentPath)) return;

    const label = resolveTabLabel(currentPath);
    openTab({ id: currentPath, label, path: currentRoutePath });
  }, [closeTab, currentPath, currentRoutePath, openTab, openTabs, resolveTabLabel]);

  useEffect(() => {
    if (!pendingTabPath) return () => {};
    if (currentPath !== pendingTabPath) return () => {};

    const timerId = window.setTimeout(() => {
      setPendingTabPath((prev) => (prev === currentPath ? '' : prev));
    }, 250);

    return () => window.clearTimeout(timerId);
  }, [currentPath, pendingTabPath]);

  useEffect(() => {
    openTabs.forEach((tab) => {
      const nextLabel = resolveRenderedTabLabel(tab);
      if (!nextLabel) return;
      if (tab.label === nextLabel) return;
      openTab({
        ...tab,
        label: nextLabel,
        path: tab.path || tab.id,
      });
    });
  }, [openTab, openTabs, resolveRenderedTabLabel]);

  useEffect(() => {
    if (
      currentPath === '/' ||
      currentPath === '/login' ||
      currentPath.startsWith('/auth')
    ) {
      return;
    }
    recentTabHistoryRef.current = [
      currentPath,
      ...recentTabHistoryRef.current.filter((tabId) => tabId !== currentPath),
    ];
  }, [currentPath]);

  useEffect(() => {
    if (!isKeepAliveCandidatePath(currentPath)) return;
    if (!routeOutlet) return;
    setMountedTabOutlets((prev) => {
      if (prev.get(currentPath) === routeOutlet) return prev;
      const next = new Map(prev);
      next.set(currentPath, routeOutlet);
      return next;
    });
  }, [currentPath, routeOutlet]);

  useEffect(() => {
    const keepAlivePaths = new Set(
      openTabs
        .map((tab) => toPathname(tab?.id || tab?.path || ''))
        .filter((path) => isKeepAliveCandidatePath(path))
    );
    if (isKeepAliveCandidatePath(currentPath)) {
      keepAlivePaths.add(currentPath);
    }
    setMountedTabOutlets((prev) => {
      let changed = false;
      const next = new Map(prev);
      prev.forEach((_value, path) => {
        if (keepAlivePaths.has(path)) return;
        next.delete(path);
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [currentPath, openTabs]);

  useEffect(() => {
    const openTabIds = new Set(openTabs.map((tab) => tab.id));
    recentTabHistoryRef.current = recentTabHistoryRef.current.filter(
      (tabId) => tabId === currentPath || openTabIds.has(tabId)
    );
  }, [currentPath, openTabs]);

  useEffect(() => {
    const blockedTabIds = openTabs
      .filter((tab) => !hasPathAccess(tab?.id))
      .map((tab) => tab.id);
    if (blockedTabIds.length === 0) return;

    blockedTabIds.forEach((tabId) => closeTab(tabId));
    if (blockedTabIds.includes(currentPath)) {
      navigate(resolveAccessiblePath(), { replace: true });
    }
  }, [closeTab, currentPath, hasPathAccess, navigate, openTabs, resolveAccessiblePath]);

  // Provide the navigation handler to the rest of the app via context.
  useEffect(() => {
    setNavigateToPath(handleNavigation);
  }, [handleNavigation, setNavigateToPath]);

  const handleLogout = async () => {
    isLoggingOutRef.current = true;
    setPendingTabPath('');
    skipAutoOpenPathRef.current = '/login';
    pendingNavigationPathRef.current = null;
    pendingCloseTabRef.current = null;
    pendingManualTabCloseRef.current = null;
    recentTabHistoryRef.current = [];
    setMountedTabOutlets(new Map());
    cancelAllTrackedRequests('logout');
    resetWorkspace();

    try {
      await signOut();
    } finally {
      resetWorkspace();
      navigate('/login', { replace: true });
    }
  };
  const handleLanguageButtonClick = React.useCallback((nextLanguageCode) => {
    setLanguageCode(nextLanguageCode);
  }, [setLanguageCode]);

  const handleMenuItemClick = (path) => {
    handleNavigation(path); // Use the centralized handler
    if (window.innerWidth < 900) { // md breakpoint
      setSidebarOpen(false);
    }
  };

  const handleTabChange = React.useCallback((event, newValue) => {
    // User clicks a tab: make URL the only source of truth.
    const selectedTab = tabsForRender.find((tab) => tab.id === newValue);
    // Pass the existing label so tabs with custom labels (e.g. style detail) are not reset.
    handleNavigation(selectedTab?.path || newValue, {
      label: selectedTab ? resolveRenderedTabLabel(selectedTab) : selectedTab?.label,
    });
  }, [handleNavigation, resolveRenderedTabLabel, tabsForRender]);

  const handleCloseTab = React.useCallback((e, tabIdToClose) => {
    e.preventDefault();
    e.stopPropagation();

    const closingTab = openTabs.find((tab) => tab.id === tabIdToClose);
    if (!closingTab) return;
    const confirmed = confirmDiscardUnsavedChanges({ path: tabIdToClose });
    if (!confirmed) return;
    pendingManualTabCloseRef.current = null;

    const remainingTabs = openTabs.filter((tab) => tab.id !== tabIdToClose);
    recentTabHistoryRef.current = recentTabHistoryRef.current.filter(
      (tabId) => tabId !== tabIdToClose
    );

    // If we are closing the currently active tab, route using recent tab history.
    if (currentPath === tabIdToClose) {
      cancelAllTrackedRequests('close_active_tab');
      if (remainingTabs.length === 0) {
        skipAutoOpenPathRef.current = EMPTY_WORKSPACE_PATH;
        pendingCloseTabRef.current = tabIdToClose;
        pendingNavigationPathRef.current = EMPTY_WORKSPACE_PATH;
        pendingManualTabCloseRef.current = {
          tabId: tabIdToClose,
          targetPath: EMPTY_WORKSPACE_PATH,
          sourcePath: currentPath,
        };
        if (currentPath === EMPTY_WORKSPACE_PATH) {
          pendingNavigationPathRef.current = null;
          pendingCloseTabRef.current = null;
          pendingManualTabCloseRef.current = null;
          closeTab(tabIdToClose);
          return;
        }
        navigate(EMPTY_WORKSPACE_PATH, { replace: true });
        schedulePendingNavigationCleanup(currentPathRef.current, EMPTY_WORKSPACE_PATH);
        return;
      }
      const remainingTabById = new Map(remainingTabs.map((tab) => [tab.id, tab]));
      const recentFallbackId = recentTabHistoryRef.current.find((tabId) =>
        remainingTabById.has(tabId)
      );
      const fallbackTab = recentFallbackId
        ? remainingTabById.get(recentFallbackId)
        : remainingTabs[remainingTabs.length - 1] || null;
      const fallbackPath =
        fallbackTab?.path ||
        fallbackTab?.id ||
        resolveAccessiblePath({ excludePaths: [tabIdToClose] });
      const fallbackPathname = toPathname(fallbackPath);
      if (fallbackPathname === currentPath) {
        pendingCloseTabRef.current = null;
        pendingNavigationPathRef.current = null;
        pendingManualTabCloseRef.current = null;
        closeTab(tabIdToClose);
        return;
      }
      pendingCloseTabRef.current = tabIdToClose;
      pendingNavigationPathRef.current = fallbackPathname;
      pendingManualTabCloseRef.current = {
        tabId: tabIdToClose,
        targetPath: fallbackPathname,
        sourcePath: currentPath,
      };
      navigate(fallbackPath);
      schedulePendingNavigationCleanup(currentPathRef.current, fallbackPathname);

      return;
    }

    // After (potentially) setting the new active tab, remove the closed tab from the list.
    closeTab(tabIdToClose);
  }, [
    closeTab,
    confirmDiscardUnsavedChanges,
    currentPath,
    navigate,
    openTabs,
    resolveAccessiblePath,
    schedulePendingNavigationCleanup,
  ]);

  const isCurrentPathKeepAlive = isKeepAliveCandidatePath(currentPath);
  const shouldRenderLiveOutlet =
    !isCurrentPathKeepAlive || !mountedTabOutlets.has(currentPath);
  const isEmptyWorkspaceScreen =
    currentPath === EMPTY_WORKSPACE_PATH && openTabs.length === 0;
  const emptyWorkspaceHint = resolveLocalizedLabel(
    EMPTY_WORKSPACE_HINT,
    languageCode
  );
  const getMenuItemSx = React.useCallback(({ selected = false, nested = false, disabled = false } = {}) => {
    const baseSx = nested ? { pl: 4 } : {};

    if (disabled) {
      return {
        ...baseSx,
        backgroundColor: 'rgba(0, 0, 0, 0.03)',
        color: 'text.disabled',
        '& .MuiListItemIcon-root': {
          color: 'text.disabled',
        },
        '& .MuiBadge-badge': {
          opacity: 0.55,
        },
        '&.Mui-disabled': {
          opacity: 1,
          cursor: 'not-allowed',
        },
        '&:hover': {
          backgroundColor: 'rgba(0, 0, 0, 0.03)',
        },
      };
    }

    if (selected) {
      return {
        ...baseSx,
        backgroundColor: 'rgba(25, 118, 210, 0.08)',
        color: 'primary.main',
        '& .MuiListItemIcon-root': {
          color: 'primary.main',
        },
        '&:hover': {
          backgroundColor: 'rgba(25, 118, 210, 0.12)',
        },
      };
    }

    return {
      ...baseSx,
      '&:hover': {
        backgroundColor: 'rgba(0, 0, 0, 0.04)',
      },
    };
  }, []);

  const sidebarContent = (
    <Box sx={{ width: DRAWER_WIDTH, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <List sx={{ flex: 1, overflowY: 'auto', pt: { xs: 1, md: 0 } }}>
        {menuItems.map((menu) => {
          const isMenuSelected = !menu.isParent && currentPath === menu.path;
          const isMenuDisabled = Boolean(menu.disabled);

          return (
            <React.Fragment key={menu.label}>
            <ListItem
              button
              disabled={isMenuDisabled}
              onClick={() => {
                if (isMenuDisabled) return;
                if (menu.isParent) {
                  if (menu.isOpen) {
                    setExpandedMenuGroup(null);
                  } else {
                    setExpandedMenuGroup(menu.menuGroupKey || null);
                  }
                  return;
                }
                handleMenuItemClick(menu.path);
              }}
              selected={isMenuSelected}
              sx={getMenuItemSx({ selected: isMenuSelected, disabled: isMenuDisabled })}
            >
              <ListItemIcon sx={{ minWidth: '40px' }}>{menu.icon}</ListItemIcon>
              <ListItemText primary={menu.label} />
              {menu.isParent && (menu.isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />)}
            </ListItem>
            {menu.isParent && (
              <Collapse in={menu.isOpen} timeout={120}>
                <List component="div" disablePadding>
                  {menu.children.map((child) => {
                    const isChildSelected =
                      currentPath === child.path ||
                      (currentPath ? currentPath.startsWith(child.path + '/') : false);
                    const isChildDisabled = Boolean(child.disabled);

                    return (
                      <ListItem
                        button
                        key={child.path}
                        disabled={isChildDisabled}
                        onClick={() => {
                          if (isChildDisabled) return;
                          handleMenuItemClick(child.path);
                        }}
                        selected={isChildSelected}
                        sx={getMenuItemSx({
                          selected: isChildSelected,
                          nested: true,
                          disabled: isChildDisabled,
                        })}
                      >
                        <ListItemIcon sx={{ minWidth: '40px' }} />
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <span>{child.label}</span>
                              {(Boolean(child.badgeLabel) || Number(child.badgeCount) > 0) && (
                                <Badge
                                  color={child.badgeLabel ? 'warning' : 'error'}
                                  badgeContent={child.badgeLabel || child.badgeCount}
                                  sx={{
                                    '& .MuiBadge-badge': {
                                      position: 'static',
                                      transform: 'none',
                                    },
                                  }}
                                />
                              )}
                            </Box>
                          }
                        />
                      </ListItem>
                    );
                  })}
                </List>
              </Collapse>
            )}
            </React.Fragment>
          );
        })}
      </List>

      <Divider />
      <List>
        <ListItem button onClick={handleLogout} sx={{ '&:hover': { backgroundColor: 'rgba(211, 47, 47, 0.08)' } }}>
          <ListItemIcon sx={{ color: '#d32f2f' }}>
            <LogoutIcon />
          </ListItemIcon>
          <ListItemText
            primary={getUiMessage('menu.logout', 'Logout', languageCode)}
            sx={{ color: '#d32f2f' }}
          />
        </ListItem>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: 'grey.100' }}>
      {/* Header */}
      <AppBar ref={appBarRef} position="fixed" sx={{ zIndex: 1201, bgcolor: 'white', color: 'black' }}>
        <Toolbar
          sx={{
            position: 'relative',
            minHeight: { xs: '56px', sm: '64px' },
            height: { xs: '56px', sm: '64px' },
            px: { xs: 1, sm: 2 },
          }}
        >
          <IconButton
            color="inherit"
            aria-label="toggle menu"
            edge="start"
            onClick={toggleSidebar}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Button
              color="primary"
              sx={{
                fontSize: { xs: '1.1rem', sm: '1.25rem' },
                fontWeight: 'bold',
                textTransform: 'none',
                minWidth: 0,
                maxWidth: { xs: 170, sm: 260, md: 360 },
                px: 0.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.2,
              }}
            >
              {activeOrgName || 'BARO'}
            </Button>
          </Box>
          {/* Center notification text */}
          <Fade in={!!notification} timeout={{ enter: 180, exit: 300 }} unmountOnExit>
            <Box
              sx={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                px: 2.5,
                py: 0.6,
                borderRadius: 99,
                bgcolor: {
                  success: 'rgba(27, 94, 32, 0.88)',
                  error: 'rgba(183, 28, 28, 0.88)',
                  warning: 'rgba(230, 81, 0, 0.88)',
                  info: 'rgba(13, 71, 161, 0.88)',
                }[notification?.type] ?? 'rgba(33, 33, 33, 0.88)',
                pointerEvents: 'none',
                zIndex: 10,
                maxWidth: '55vw',
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  color: '#fff',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {notification?.message || ''}
              </Typography>
            </Box>
          </Fade>

          <Button
            color="inherit"
            onClick={() =>
              handleNavigation('/profile', {
                label: getUiMessage('menu.profile', '\uAC1C\uC778 \uC815\uBCF4', languageCode),
              })
            }
            startIcon={<AccountCircleIcon fontSize="small" />}
            sx={{
              mr: 1,
              minWidth: 0,
              px: 1,
              color: 'text.secondary',
              textTransform: 'none',
              maxWidth: { xs: 160, sm: 240, md: 320 },
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              '& .MuiButton-startIcon': {
                mr: 0.5,
                color: 'text.secondary',
              },
            }}
          >
            {activeUserSummary}
          </Button>

          <LanguageSwitcher
            languageCode={languageCode}
            onChange={handleLanguageButtonClick}
          />

        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            top: headerOffset,
            height: `calc(100% - ${headerOffset})`,
            borderRight: '1px solid #ddd',
            overflowX: 'hidden',
          },
        }}
      >
        {sidebarContent}
      </Drawer>
      <Drawer
        variant="temporary"
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            top: headerOffset,
            height: `calc(100% - ${headerOffset})`,
          },
        }}
      >
        {sidebarContent}
      </Drawer>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          pl: { md: `${DRAWER_WIDTH}px` },
          pt: headerOffset,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          height: '100%',
          boxSizing: 'border-box',
        }}
      >
        <WorkspaceTabsBar
          currentPath={currentPath}
          pendingTabPath={pendingTabPath}
          tabsForRender={tabsForRender}
          onTabChange={handleTabChange}
          onCloseTab={handleCloseTab}
          resolveRenderedTabLabel={resolveRenderedTabLabel}
        />

        <Box
          sx={{
            flexGrow: 1,
            minWidth: 0,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            bgcolor: 'white',
            position: 'relative',
          }}
        >
          {isEmptyWorkspaceScreen ? (
            <Box
              sx={{
                minHeight: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                px: 2,
              }}
            >
              <Stack spacing={1.5} alignItems="center">
                <Typography
                  sx={{
                    fontSize: { xs: '2.4rem', md: '3.4rem' },
                    fontWeight: 800,
                    letterSpacing: '0.2em',
                    lineHeight: 1,
                    color: 'rgba(15, 23, 42, 0.82)',
                    textTransform: 'uppercase',
                  }}
                >
                  LINEOS
                </Typography>
                <Typography
                  variant="body1"
                  sx={{
                    color: 'text.secondary',
                    fontWeight: 500,
                  }}
                >
                  {emptyWorkspaceHint}
                </Typography>
              </Stack>
            </Box>
          ) : (
            <>
              {Array.from(mountedTabOutlets.entries()).map(([path, element]) => (
                <RequestScopeBoundary
                  key={path}
                  scopeId={path}
                  active={currentPath === path}
                >
                  <Box
                    sx={{
                      display: currentPath === path ? 'flex' : 'none',
                      flexDirection: 'column',
                      minHeight: '100%',
                      minWidth: 0,
                    }}
                  >
                    {element}
                  </Box>
                </RequestScopeBoundary>
              ))}
              {shouldRenderLiveOutlet && isCurrentPathKeepAlive ? (
                <RequestScopeBoundary scopeId={currentPath} active>
                  {routeOutlet}
                </RequestScopeBoundary>
              ) : null}
              {shouldRenderLiveOutlet && !isCurrentPathKeepAlive ? routeOutlet : null}
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default MainLayout;

