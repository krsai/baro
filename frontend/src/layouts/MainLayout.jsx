import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import {
  AppBar,
  Toolbar,
  Button,
  Box,
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
import HomeIcon from '@mui/icons-material/Home';
import ProductionQuantityLimitsIcon from '@mui/icons-material/ProductionQuantityLimits';
import OrganizationIcon from '@mui/icons-material/AccountTree';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BusinessIcon from '@mui/icons-material/Business';
import GroupIcon from '@mui/icons-material/Group';
import BadgeIcon from '@mui/icons-material/Badge';
import SecurityIcon from '@mui/icons-material/Security';
import InfoIcon from '@mui/icons-material/Info';
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
import RateReviewIcon from '@mui/icons-material/RateReview';
import ListAltIcon from '@mui/icons-material/ListAlt';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CalculateIcon from '@mui/icons-material/Calculate';
import { buildQueryString, cancelAllTrackedRequests, requestJSON } from '../utils/apiClient';
import { canAccessPath } from '../utils/accessControl';
import GlobalLoadingOverlay from '../components/GlobalLoadingOverlay';
import useNetworkLoading from '../hooks/useNetworkLoading';

const DRAWER_WIDTH = 260;

const KEEP_ALIVE_PATHS = new Set(['/assignment']);
const KeepAliveAssign = React.lazy(() => import('../pages/App/Assign'));
const toPathname = (path) => {
  const raw = typeof path === 'string' ? path.trim() : '';
  if (!raw) return '/';
  const withoutHash = raw.split('#')[0];
  const pathname = withoutHash.split('?')[0];
  return pathname || '/';
};

const resolveNameFromEmail = (email) => {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalized || !normalized.includes('@')) return '';
  return normalized.split('@')[0];
};

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
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
    setNavigateToPath,
    notification,
    dismissNotification,
  } = useApp();
  const networkLoading = useNetworkLoading();

  const [mountedKeepAlivePaths, setMountedKeepAlivePaths] = useState(() => {
    const s = new Set();
    if (KEEP_ALIVE_PATHS.has(currentPath)) s.add(currentPath);
    return s;
  });

  const [adminOpen, setAdminOpen] = useState(false);
  const [basicInfoOpen, setBasicInfoOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [productionOpen, setProductionOpen] = useState(false);
  const [accountingOpen, setAccountingOpen] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
  const [pendingEmployeeCount, setPendingEmployeeCount] = useState(0);
  const skipAutoOpenPathRef = useRef(null);
  const isLoggingOutRef = useRef(false);
  const pendingNavigationPathRef = useRef(null);
  const pendingCloseTabRef = useRef(null);
  const currentPathRef = useRef(currentPath);
  const recentTabHistoryRef = useRef([]);

  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  const schedulePendingNavigationCleanup = React.useCallback((sourcePath, nextPathname) => {
    window.setTimeout(() => {
      if (pendingNavigationPathRef.current !== nextPathname) return;
      if (currentPathRef.current !== sourcePath) return;
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
  const canViewEmployeeMenu = hasPathAccess('/employee');
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

  const menuItems = useMemo(() => {
    const baseItems = [
      {
        label: '대시보드',
        icon: <HomeIcon />,
        path: '/',
        isParent: false,
      },
      {
        label: '영업 관리',
        icon: <ShoppingCartIcon />,
        isParent: true,
        isOpen: orderOpen,
        setOpen: setOrderOpen,
        children: [
          { label: '주문', icon: <ListAltIcon />, path: '/order' },
          { label: '스타일', icon: <StyleIcon />, path: '/style' },
        ],
      },
      {
        label: '생산 관리',
        icon: <ProductionQuantityLimitsIcon />,
        isParent: true,
        isOpen: productionOpen,
        setOpen: setProductionOpen,
        children: [
          { label: '작업 배정', icon: <ContentCut />, path: '/assignment' },
          { label: '작업 계획 협의', icon: <TimelineIcon />, path: '/production-plan' },
          { label: '배정 결과', icon: <RateReviewIcon />, path: '/ct-review' },
          { label: '작업 기록', icon: <HistoryIcon />, path: '/work-history' },
          { label: '출퇴근 입력', icon: <ScheduleIcon />, path: '/attendance' },
        ],
      },
      {
        label: '회계 관리',
        icon: <AccountBalanceWalletIcon />,
        isParent: true,
        isOpen: accountingOpen,
        setOpen: setAccountingOpen,
        children: [
          { label: '급여 계산', icon: <CalculateIcon />, path: '/payroll' },
          { label: '초과 생산', icon: <ListAltIcon />, path: '/production-overrun' },
        ],
      },
      {
        label: '조직 관리',
        icon: <OrganizationIcon />,
        isParent: true,
        isOpen: adminOpen,
        setOpen: setAdminOpen,
        children: [
          { label: '사업체 관리', icon: <BusinessIcon />, path: '/business' },
          { label: '라인 관리', icon: <ContentCut />, path: '/line' },
          {
            label: '직원 관리',
            icon: <GroupIcon />,
            path: '/employee',
            badgeCount: pendingEmployeeCount,
          },
          { label: '고객 관리', icon: <PeopleIcon />, path: '/customer' },
          { label: '개인 정보', icon: <AccountCircleIcon />, path: '/profile' },
        ],
      },
      {
        label: '기본 정보',
        icon: <InfoIcon />,
        isParent: true,
        isOpen: basicInfoOpen,
        setOpen: setBasicInfoOpen,
        children: [
          { label: '속성 관리', icon: <DnsIcon />, path: '/attribute' },
          { label: '권한 관리', icon: <SecurityIcon />, path: '/permission' },
          { label: '휴일 관리', icon: <CalendarMonthIcon />, path: '/holiday' },
        ],
      },
      {
        label: '시스템 설정',
        icon: <TuneIcon />,
        isParent: true,
        isOpen: systemOpen,
        setOpen: setSystemOpen,
        children: [{ label: '구독 관리', icon: <TuneIcon />, path: '/system-setting' }],
      },
    ];

    return baseItems
      .map((item) => {
        if (!item.isParent) {
          return hasPathAccess(item.path) ? item : null;
        }
        const visibleChildren = item.children.filter((child) =>
          hasPathAccess(child.path)
        );
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
    basicInfoOpen,
    hasPathAccess,
    orderOpen,
    pendingEmployeeCount,
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
      const matchedMenu =
        flattenedMenuItems.find((item) => item.path === path) ||
        flattenedMenuItems.find((item) => path.startsWith(item.path + '/'));
      return matchedMenu?.label || path;
    },
    [flattenedMenuItems]
  );
  // 대시보드 탭이 명시적으로 열려있지 않은 채 currentPath='/'일 때 Outlet을 숨긴다.
  // openTabs.length === 0 조건만 쓰면, 메뉴 클릭 시 탭이 추가된 직후 라우트 전환 전
  // 렌더 사이클에서 대시보드가 순간 노출(flash)되는 문제가 발생한다.
  const hasDashboardTab = openTabs.some((tab) => tab.id === '/');
  const shouldHideOutletForEmptyWorkspace =
    currentPath === '/' && !hasDashboardTab && isAuthenticated && hasPathAccess('/');
  const tabsForRender = useMemo(() => {
    // During route transition, avoid rendering a transient optimistic tab for
    // the previous pathname (e.g. dashboard flash while opening another menu).
    if (
      pendingNavigationPathRef.current &&
      pendingNavigationPathRef.current !== currentPath
    ) {
      return openTabs;
    }
    if (openTabs.some((tab) => tab.id === currentPath)) return openTabs;
    if (currentPath === '/login' || currentPath.startsWith('/auth')) return openTabs;
    // Keep the empty workspace behavior when dashboard tab is intentionally closed.
    if (openTabs.length === 0 && currentPath === '/') return openTabs;

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

  // The core navigation logic, wrapped in useCallback for stability.
  const handleNavigation = React.useCallback(
    (path, options) => {
      const nextPath = typeof path === 'string' && path.trim() ? path : '/';
      const nextPathname = toPathname(nextPath);

      if (!hasPathAccess(nextPathname)) {
        if (currentPath !== '/') {
          navigate('/');
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
    if (currentPath === '/login' || currentPath.startsWith('/auth')) return;
    if (skipAutoOpenPathRef.current === currentPath) return;
    // Allow the user to close the dashboard tab and stay in an empty workspace.
    if (openTabs.length === 0 && currentPath === '/') return;
    if (openTabs.some((tab) => tab.id === currentPath)) return;

    const label = resolveTabLabel(currentPath);
    openTab({ id: currentPath, label, path: currentRoutePath });
  }, [closeTab, currentPath, currentRoutePath, openTab, openTabs, resolveTabLabel]);

  useEffect(() => {
    if (currentPath === '/login' || currentPath.startsWith('/auth')) return;
    recentTabHistoryRef.current = [
      currentPath,
      ...recentTabHistoryRef.current.filter((tabId) => tabId !== currentPath),
    ];
  }, [currentPath]);

  useEffect(() => {
    if (KEEP_ALIVE_PATHS.has(currentPath)) {
      setMountedKeepAlivePaths((prev) => {
        if (prev.has(currentPath)) return prev;
        const next = new Set(prev);
        next.add(currentPath);
        return next;
      });
    }
  }, [currentPath]);

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
      navigate('/');
    }
  }, [closeTab, currentPath, hasPathAccess, navigate, openTabs]);

  // Provide the navigation handler to the rest of the app via context.
  useEffect(() => {
    setNavigateToPath(handleNavigation);
  }, [handleNavigation, setNavigateToPath]);

  const handleLogout = async () => {
    isLoggingOutRef.current = true;
    skipAutoOpenPathRef.current = currentPath;
    resetWorkspace();

    try {
      await signOut();
    } finally {
      resetWorkspace();
      navigate('/login', { replace: true });
    }
  };

  const handleMenuItemClick = (path) => {
    handleNavigation(path); // Use the centralized handler
    if (window.innerWidth < 900) { // md breakpoint
      setSidebarOpen(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    // User clicks a tab: make URL the only source of truth.
    const selectedTab = tabsForRender.find((tab) => tab.id === newValue);
    handleNavigation(selectedTab?.path || newValue);
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
      const remainingTabById = new Map(remainingTabs.map((tab) => [tab.id, tab]));
      const recentFallbackId = recentTabHistoryRef.current.find((tabId) =>
        remainingTabById.has(tabId)
      );
      const fallbackTab = recentFallbackId
        ? remainingTabById.get(recentFallbackId)
        : remainingTabs[remainingTabs.length - 1] || null;
      if (!fallbackTab) {
        skipAutoOpenPathRef.current = tabIdToClose;
        pendingCloseTabRef.current = null;
        pendingNavigationPathRef.current = null;
        closeTab(tabIdToClose);
        if (currentPath !== '/') {
          navigate('/');
        }
        return;
      }
      const fallbackPath = fallbackTab ? (fallbackTab.path || fallbackTab.id) : '/';
      const fallbackPathname = toPathname(fallbackPath);
      if (fallbackPathname === currentPath) {
        skipAutoOpenPathRef.current = tabIdToClose;
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

  const sidebarContent = (
    <Box sx={{ width: DRAWER_WIDTH, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <List sx={{ flex: 1, overflowY: 'auto' }}>
        {menuItems.map((menu) => {
          const isRootMenuSelected =
            !menu.isParent &&
            menu.path === '/' &&
            currentPath === '/' &&
            hasDashboardTab;
          const isNonRootMenuSelected =
            !menu.isParent && menu.path !== '/' && currentPath === menu.path;
          const isMenuSelected = isRootMenuSelected || isNonRootMenuSelected;

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
                            {child.badgeCount > 0 && (
                              <Badge
                                color="error"
                                badgeContent={child.badgeCount}
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
          {/* Keep-alive: /assignment — stays mounted after first visit */}
          {mountedKeepAlivePaths.has('/assignment') && (
            <Box
              sx={{
                display: currentPath === '/assignment' ? 'flex' : 'none',
                flexDirection: 'column',
                minHeight: '100%',
                minWidth: 0,
              }}
            >
              <React.Suspense fallback={null}>
                <KeepAliveAssign />
              </React.Suspense>
            </Box>
          )}
          {/* Regular outlet for all non-keep-alive routes */}
          {!KEEP_ALIVE_PATHS.has(currentPath) && !shouldHideOutletForEmptyWorkspace && <Outlet />}
          <GlobalLoadingOverlay
            open={networkLoading.isLoading}
            startedAt={networkLoading.startedAt}
            activeRequestCount={networkLoading.activeRequestCount}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default MainLayout;


