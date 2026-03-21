import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
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
import ListAltIcon from '@mui/icons-material/ListAlt';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CalculateIcon from '@mui/icons-material/Calculate';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import { buildQueryString, cancelAllTrackedRequests, requestJSON } from '../utils/apiClient';
import { canAccessPath, resolveFirstAccessiblePath } from '../utils/accessControl';
import { getUiMessage } from '../constants/uiMessages';
import LanguageSwitcher from '../components/LanguageSwitcher';
import useNetworkLoading from '../hooks/useNetworkLoading';
import { RequestScopeBoundary } from '../context/RequestScopeContext';

const DRAWER_WIDTH = 260;
const EMPTY_WORKSPACE_PATH = '/workspace';

const toPathname = (path) => {
  const raw = typeof path === 'string' ? path.trim() : '';
  if (!raw) return '/';
  const withoutHash = raw.split('#')[0];
  const pathname = withoutHash.split('?')[0];
  return pathname || '/';
};
const isKeepAliveCandidatePath = (path) => {
  const pathname = toPathname(path);
  if (!pathname || pathname === '/') return false;
  if (pathname === EMPTY_WORKSPACE_PATH) return false;
  if (pathname === '/login') return false;
  if (pathname.startsWith('/auth')) return false;
  return true;
};

const resolveNameFromEmail = (email) => {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalized || !normalized.includes('@')) return '';
  return normalized.split('@')[0];
};

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
    toggleSidebar,
    setSidebarOpen,
    openTabs,
    openTab,
    closeTab,
    resetWorkspace,
    setActivePath,
    setNavigateToPath,
    notification,
  } = useApp();
  const { languageCode, setLanguageCode } = useLanguage();
  const networkLoading = useNetworkLoading();

  const [mountedTabOutlets, setMountedTabOutlets] = useState(() => {
    if (!isKeepAliveCandidatePath(currentPath) || !routeOutlet) return new Map();
    return new Map([[currentPath, routeOutlet]]);
  });

  const [adminOpen, setAdminOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [productionOpen, setProductionOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [accountingOpen, setAccountingOpen] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
  const [pendingEmployeeCount, setPendingEmployeeCount] = useState(0);
  const [pendingOnboardingCount, setPendingOnboardingCount] = useState(0);
  const skipAutoOpenPathRef = useRef(null);
  const isLoggingOutRef = useRef(false);
  const pendingNavigationPathRef = useRef(null);
  const pendingCloseTabRef = useRef(null);
  const currentPathRef = useRef(currentPath);
  const recentTabHistoryRef = useRef([]);

  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  useEffect(() => {
    setActivePath(currentPath);
  }, [currentPath, setActivePath]);

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
  const activeUserSummary = useMemo(() => {
    if (activeOrgName && activeUserName) return `${activeOrgName} | ${activeUserName}`;
    return activeOrgName || activeUserName || '접속자 정보 없음';
  }, [activeOrgName, activeUserName]);

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
      setPendingEmployeeCount(Array.isArray(data) ? data.length : 0);
    } catch (_error) {
      // ignore fetch errors for badge
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
        label: getUiMessage('menu.sales', '영업 관리', languageCode),
        icon: <ShoppingCartIcon />,
        isParent: true,
        isOpen: orderOpen,
        setOpen: setOrderOpen,
        children: [
          {
            label: getUiMessage('menu.order', '주문', languageCode),
            icon: <ListAltIcon />,
            path: '/order',
          },
          {
            label: getUiMessage('menu.style', '스타일', languageCode),
            icon: <StyleIcon />,
            path: '/style',
          },
        ],
      },
      {
        label: getUiMessage('menu.production', '생산 관리', languageCode),
        icon: <ProductionQuantityLimitsIcon />,
        isParent: true,
        isOpen: productionOpen,
        setOpen: setProductionOpen,
        children: [
          {
            label: getUiMessage('menu.assignment', '작업 배정', languageCode),
            icon: <ContentCut />,
            path: '/assignment',
          },
          {
            label: getUiMessage('menu.productionPlan', '작업 계획 현황', languageCode),
            icon: <TimelineIcon />,
            path: '/production-plan',
          },
          {
            label: getUiMessage('menu.standardReview', '표준 공임 검토', languageCode),
            icon: <FactCheckIcon />,
            path: '/st-review',
          },
          {
            label: getUiMessage('menu.workHistory', '작업 기록', languageCode),
            icon: <HistoryIcon />,
            path: '/work-history',
          },
          {
            label: getUiMessage('menu.attendance', '출퇴근 입력', languageCode),
            icon: <ScheduleIcon />,
            path: '/attendance',
          },
        ],
      },
      {
        label: getUiMessage('menu.inventory', '재고 관리', languageCode),
        icon: <Inventory2Icon />,
        isParent: true,
        isOpen: inventoryOpen,
        setOpen: setInventoryOpen,
        children: [
          {
            label: getUiMessage('menu.inventoryIssue', '재고 불출', languageCode),
            icon: <Inventory2Icon />,
            path: '/inventory',
          },
        ],
      },
      {
        label: getUiMessage('menu.accounting', '회계 관리', languageCode),
        icon: <AccountBalanceWalletIcon />,
        isParent: true,
        isOpen: accountingOpen,
        setOpen: setAccountingOpen,
        children: [
          {
            label: getUiMessage('menu.payroll', '급여 계산', languageCode),
            icon: <CalculateIcon />,
            path: '/payroll',
          },
          {
            label: getUiMessage('menu.productionResult', '생산 결과', languageCode),
            icon: <ListAltIcon />,
            path: '/production-result',
          },
        ],
      },
      {
        label: getUiMessage('menu.organization', '조직 관리', languageCode),
        icon: <OrganizationIcon />,
        isParent: true,
        isOpen: adminOpen,
        setOpen: setAdminOpen,
        children: [
          {
            label: getUiMessage('menu.business', '사업체 관리', languageCode),
            icon: <BusinessIcon />,
            path: '/business',
          },
          {
            label: getUiMessage('menu.line', '라인 관리', languageCode),
            icon: <ContentCut />,
            path: '/line',
          },
          {
            label: getUiMessage('menu.employee', '직원 관리', languageCode),
            icon: <GroupIcon />,
            path: '/employee',
            badgeCount: pendingEmployeeCount,
          },
          {
            label: getUiMessage('menu.customer', '고객 관리', languageCode),
            icon: <PeopleIcon />,
            path: '/customer',
          },
          {
            label: getUiMessage('menu.holiday', '휴일 관리', languageCode),
            icon: <CalendarMonthIcon />,
            path: '/holiday',
          },
          {
            label: getUiMessage('menu.profile', '개인 정보', languageCode),
            icon: <AccountCircleIcon />,
            path: '/profile',
          },
          {
            label: getUiMessage('menu.subscription', '구독 관리', languageCode),
            icon: <TuneIcon />,
            path: '/system-setting',
          },
        ],
      },
      {
        label: getUiMessage('menu.system', '시스템 설정', languageCode),
        icon: <TuneIcon />,
        isParent: true,
        isOpen: systemOpen,
        setOpen: setSystemOpen,
        children: [
          {
            label: getUiMessage('menu.attribute', '속성 관리', languageCode),
            icon: <DnsIcon />,
            path: '/attribute',
          },
          {
            label: getUiMessage('menu.staticOptions', '정적 사전', languageCode),
            icon: <DnsIcon />,
            path: '/system-setting/static-options',
          },
          {
            label: getUiMessage('menu.onboardingApproval', '가입 승인', languageCode),
            icon: <GroupIcon />,
            path: '/system-onboarding',
            badgeLabel:
              pendingOnboardingCount > 0
                ? getUiMessage('common.new', '신규', languageCode)
                : '',
          },
        ],
      },
    ];

    const customerMenuItem = {
      label: getUiMessage('menu.customer', '怨좉컼', languageCode),
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

        if (childPaths.has('/employee')) {
          visibleChildren = visibleChildren.filter((child) => child.path !== '/customer');
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
    hasPathAccess,
    inventoryOpen,
    languageCode,
    orderOpen,
    pendingEmployeeCount,
    pendingOnboardingCount,
    productionOpen,
    systemOpen,
  ]);
  const flattenedMenuItems = useMemo(
    () =>
      menuItems.flatMap((item) =>
        item.isParent ? item.children : [item]
      ),
    [menuItems]
  );
  const resolveTabLabel = React.useCallback(
    (path) => {
      if (path === '/work-history/new') {
        return getUiMessage('menu.workHistory', '작업 기록', languageCode);
      }
      if (path.startsWith('/work-history/') && path !== '/work-history') {
        return getUiMessage('menu.workHistory', '작업 기록', languageCode);
      }
      const matchedMenu =
        flattenedMenuItems.find((item) => item.path === path) ||
        flattenedMenuItems.find((item) => path.startsWith(item.path + '/'));
      return matchedMenu?.label || path;
    },
    [flattenedMenuItems, languageCode]
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
      currentPath === EMPTY_WORKSPACE_PATH ||
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
  const tabLoadingCounts = useMemo(() => {
    const next = new Map();
    (networkLoading.scopes || []).forEach((entry) => {
      if (entry?.groupId !== 'workspace') return;
      const rootScopeId = String(entry?.scopeId || '').split('::')[0];
      const tabId = toPathname(rootScopeId);
      if (!tabId || tabId === '/' || tabId === EMPTY_WORKSPACE_PATH) return;
      const activeRequestCount = Number(entry?.activeRequestCount) || 0;
      if (activeRequestCount <= 0) return;
      next.set(tabId, (next.get(tabId) || 0) + activeRequestCount);
    });
    return next;
  }, [networkLoading.scopes]);
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
      // For payroll detail pages, ensure only one detail tab is open.
      if (nextPathname.startsWith('/payroll/') && nextPathname !== '/payroll') {
        openOptions.replacePrefix = '/payroll/';
      }

      // The `openTab` function from context already checks for duplicates,
      // so we can call it directly. This removes the dependency on `openTabs`.
      let label = options?.label;
      if (!label) {
        label = resolveTabLabel(nextPathname);
      }
      openTab({ id: nextPathname, label, path: nextPath }, openOptions);

      if (nextPath && currentRoutePath !== nextPath) {
        pendingCloseTabRef.current = closeTabId;
        pendingNavigationPathRef.current = nextPathname;
        navigate(nextPath);
        schedulePendingNavigationCleanup(currentPathRef.current, nextPathname);
      } else if (closeTabId && currentPath !== closeTabId) {
        pendingCloseTabRef.current = null;
        closeTab(closeTabId);
      }
    },
    [
      closeTab,
      currentPath,
      currentRoutePath,
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

    if (skipAutoOpenPathRef.current && currentPath !== skipAutoOpenPathRef.current) {
      skipAutoOpenPathRef.current = null;
    }

    if (isLoggingOutRef.current) return;
    if (
      currentPath === '/' ||
      currentPath === EMPTY_WORKSPACE_PATH ||
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
    openTabs.forEach((tab) => {
      const matchedMenu = flattenedMenuItems.find((item) => item.path === tab.id);
      if (!matchedMenu) return;
      if (tab.label === matchedMenu.label) return;
      openTab({
        ...tab,
        label: matchedMenu.label,
        path: tab.path || tab.id,
      });
    });
  }, [flattenedMenuItems, openTab, openTabs]);

  useEffect(() => {
    if (
      currentPath === '/' ||
      currentPath === EMPTY_WORKSPACE_PATH ||
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
    skipAutoOpenPathRef.current = '/login';
    pendingNavigationPathRef.current = null;
    pendingCloseTabRef.current = null;
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

  const handleTabChange = (event, newValue) => {
    // User clicks a tab: make URL the only source of truth.
    const selectedTab = tabsForRender.find((tab) => tab.id === newValue);
    // Pass the existing label so tabs with custom labels (e.g. style detail) are not reset.
    handleNavigation(selectedTab?.path || newValue, { label: selectedTab?.label });
  };

  const handleCloseTab = (e, tabIdToClose) => {
    e.preventDefault();
    e.stopPropagation();

    const closingTab = openTabs.find((tab) => tab.id === tabIdToClose);
    if (!closingTab) return;

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
        closeTab(tabIdToClose);
        return;
      }
      pendingCloseTabRef.current = tabIdToClose;
      pendingNavigationPathRef.current = fallbackPathname;
      navigate(fallbackPath);
      schedulePendingNavigationCleanup(currentPathRef.current, fallbackPathname);

      return;
    }

    // After (potentially) setting the new active tab, remove the closed tab from the list.
    closeTab(tabIdToClose);
  };

  const isCurrentPathKeepAlive = isKeepAliveCandidatePath(currentPath);
  const shouldRenderLiveOutlet =
    !isCurrentPathKeepAlive || !mountedTabOutlets.has(currentPath);

  const sidebarContent = (
    <Box sx={{ width: DRAWER_WIDTH, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <List sx={{ flex: 1, overflowY: 'auto' }}>
        {menuItems.map((menu) => {
          const isMenuSelected = !menu.isParent && currentPath === menu.path;

          return (
            <React.Fragment key={menu.label}>
            <ListItem
              button
              onClick={() => menu.isParent ? menu.setOpen(!menu.isOpen) : handleMenuItemClick(menu.path)}
              selected={isMenuSelected}
              sx={
                isMenuSelected
                  ? {
                      backgroundColor: 'rgba(25, 118, 210, 0.08)', // A light blue background
                      color: 'primary.main',
                      '& .MuiListItemIcon-root': {
                        color: 'primary.main',
                      },
                      '&:hover': {
                        backgroundColor: 'rgba(25, 118, 210, 0.12)',
                      },
                    }
                  : {
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.04)',
                      },
                    }
              }
            >
              <ListItemIcon sx={{ minWidth: '40px' }}>{menu.icon}</ListItemIcon>
              <ListItemText primary={menu.label} />
              {menu.isParent && (menu.isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />)}
            </ListItem>
            {menu.isParent && (
              <Collapse in={menu.isOpen} timeout={120}>
                <List component="div" disablePadding>
                  {menu.children.map((child) => (
                    <ListItem
                      button
                      key={child.path}
                      onClick={() => handleMenuItemClick(child.path)}
                      selected={
                        currentPath === child.path ||
                        (currentPath ? currentPath.startsWith(child.path + '/') : false)
                      }
                      sx={
                        currentPath === child.path ||
                        (currentPath ? currentPath.startsWith(child.path + '/') : false)
                          ? {
                              pl: 4,
                              backgroundColor: 'rgba(25, 118, 210, 0.08)',
                              color: 'primary.main',
                              '& .MuiListItemIcon-root': {
                                color: 'primary.main',
                              },
                              '&:hover': {
                                backgroundColor: 'rgba(25, 118, 210, 0.12)',
                              },
                            }
                          : {
                              pl: 4,
                              '&:hover': {
                                backgroundColor: 'rgba(0, 0, 0, 0.04)',
                              },
                            }
                      }
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
                  ))}
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
          <ListItemText primary="로그아웃" sx={{ color: '#d32f2f' }} />
        </ListItem>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: 'grey.100' }}>
      {/* Header */}
      <AppBar position="fixed" sx={{ zIndex: 1201, bgcolor: 'white', color: 'black' }}>
        <Toolbar sx={{ position: 'relative' }}>
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
            <Button color="primary" sx={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
              {activeOrgName || 'BARO'}
            </Button>
          </Box>
          {/* ?묐컮 以묒븰 ?좎뒪??*/}
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

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mr: 1.5,
              maxWidth: { xs: 160, sm: 240, md: 320 },
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {activeUserSummary}
          </Typography>

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
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', top: '64px', height: 'calc(100% - 64px)', borderRight: '1px solid #ddd', overflowX: 'hidden' },
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
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
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
          pt: '64px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          height: '100%',
          boxSizing: 'border-box',
        }}
      >
        <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#f4f6f8' }}>
          <Tabs
            value={tabsForRender.some((tab) => tab.id === currentPath) ? currentPath : false}
            onChange={handleTabChange}
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
            {tabsForRender.map((tab) => (
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
                    {tab.label}
                    {tabLoadingCounts.get(tab.id) > 0 && (
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
                        onClick={(e) => handleCloseTab(e, tab.id)}
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
            ))}
          </Tabs>
        </Box>

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
        </Box>
      </Box>
    </Box>
  );
};

export default MainLayout;


