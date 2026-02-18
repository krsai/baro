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
  Snackbar,
  Alert,
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
import StyleIcon from '@mui/icons-material/Style';
import HistoryIcon from '@mui/icons-material/History';
import CloseIcon from '@mui/icons-material/Close';
import DnsIcon from '@mui/icons-material/Dns';
import ContentCut from '@mui/icons-material/ContentCut';
import TimelineIcon from '@mui/icons-material/Timeline';
import ListAltIcon from '@mui/icons-material/ListAlt';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CalculateIcon from '@mui/icons-material/Calculate';
import { buildQueryString, requestJSON } from '../utils/apiClient';
import { canAccessPath } from '../utils/accessControl';
import GlobalLoadingOverlay from '../components/GlobalLoadingOverlay';
import useNetworkLoading from '../hooks/useNetworkLoading';

const DRAWER_WIDTH = 260;

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname || '/';
  const { signOut, devBypass, devProfile } = useAuth();
  const {
    sidebarOpen,
    toggleSidebar,
    setSidebarOpen,
    openTabs,
    openTab,
    closeTab,
    setNavigateToPath,
    notification,
    dismissNotification,
  } = useApp();
  const networkLoading = useNetworkLoading();

  const [adminOpen, setAdminOpen] = useState(false);
  const [basicInfoOpen, setBasicInfoOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [productionOpen, setProductionOpen] = useState(false);
  const [accountingOpen, setAccountingOpen] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
  const [pendingEmployeeCount, setPendingEmployeeCount] = useState(0);
  const skipAutoOpenPathRef = useRef(null);
  const pendingNavigationPathRef = useRef(null);
  const activeOrgId = useMemo(() => {
    if (!devBypass) return null;
    const parsed = Number(devProfile?.orgId);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [devBypass, devProfile?.orgId]);
  const authState = useMemo(
    () => ({
      isAuthenticated: true,
      devBypass,
      devProfile,
    }),
    [devBypass, devProfile]
  );
  const hasPathAccess = React.useCallback(
    (path) => canAccessPath(path, authState),
    [authState]
  );
  const canViewEmployeeMenu = hasPathAccess('/employee');

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
          { label: '작업 기록', icon: <HistoryIcon />, path: '/work-history' },
        ],
      },
      {
        label: '회계 관리',
        icon: <AccountBalanceWalletIcon />,
        isParent: true,
        isOpen: accountingOpen,
        setOpen: setAccountingOpen,
        children: [{ label: '급여 계산', icon: <CalculateIcon />, path: '/payroll' }],
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
        children: [{ label: '멤버십 관리', icon: <TuneIcon />, path: '/system-setting' }],
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
      if (!hasPathAccess(path)) {
        if (currentPath !== '/') {
          navigate('/');
        }
        return;
      }

      const openOptions = {};
      const closeTabId =
        typeof options?.closeTabId === 'string' && options.closeTabId.trim()
          ? options.closeTabId
          : null;
      // For style detail pages, ensure only one is open at a time.
      if (path.startsWith('/style/') && path !== '/style') {
        openOptions.replacePrefix = '/style/';
      }
      // For order detail pages, ensure only one is open at a time.
      if (path.startsWith('/order/') && path !== '/order') {
        openOptions.replacePrefix = '/order/';
      }
      // For work history detail pages, ensure only one detail tab is open.
      if (path.startsWith('/work-history/') && path !== '/work-history') {
        openOptions.replacePrefix = '/work-history/';
      }
      // For payroll detail pages, ensure only one detail tab is open.
      if (path.startsWith('/payroll/') && path !== '/payroll') {
        openOptions.replacePrefix = '/payroll/';
      }

      // If a caller requests closing a tab as part of navigation, block auto re-open
      // for that path during this transition and close it before route sync.
      if (closeTabId) {
        skipAutoOpenPathRef.current = closeTabId;
        closeTab(closeTabId);
      }
      
      // The `openTab` function from context already checks for duplicates,
      // so we can call it directly. This removes the dependency on `openTabs`.
      let label = options?.label;
      if (!label) {
        const flattenedMenuItems = menuItems.flatMap((item) =>
          item.isParent ? item.children : [item]
        );
        const menuItem = flattenedMenuItems.find((item) => item.path === path);
        label = menuItem ? menuItem.label : path;
      }
      openTab({ id: path, label, path }, openOptions);

      if (path && currentPath !== path) {
        pendingNavigationPathRef.current = path;
        navigate(path);
      }
    },
    [closeTab, currentPath, hasPathAccess, menuItems, navigate, openTab]
  );

  useEffect(() => {
    if (pendingNavigationPathRef.current) {
      if (pendingNavigationPathRef.current !== currentPath) {
        return;
      }
      pendingNavigationPathRef.current = null;
    }

    if (skipAutoOpenPathRef.current && currentPath !== skipAutoOpenPathRef.current) {
      skipAutoOpenPathRef.current = null;
    }

    if (currentPath === '/login' || currentPath.startsWith('/auth')) return;
    if (skipAutoOpenPathRef.current === currentPath) return;
    // Allow the user to close the dashboard tab and stay in an empty workspace.
    if (openTabs.length === 0 && currentPath === '/') return;
    if (openTabs.some((tab) => tab.id === currentPath)) return;

    const flattenedMenuItems = menuItems.flatMap((item) =>
      item.isParent ? item.children : [item]
    );
    const matchedMenu =
      flattenedMenuItems.find((item) => item.path === currentPath) ||
      flattenedMenuItems.find((item) => currentPath.startsWith(item.path + '/'));
    const label = matchedMenu?.label || currentPath;
    openTab({ id: currentPath, label, path: currentPath });
  }, [currentPath, menuItems, openTab, openTabs]);

  useEffect(() => {
    const blockedTabIds = openTabs
      .filter((tab) => !hasPathAccess(tab?.path || tab?.id))
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
    await signOut();
    navigate('/login');
  };

  const handleMenuItemClick = (path) => {
    handleNavigation(path); // Use the centralized handler
    if (window.innerWidth < 900) { // md breakpoint
      setSidebarOpen(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    // User clicks a tab: make URL the only source of truth.
    handleNavigation(newValue);
  };

  const handleCloseTab = (e, tabIdToClose) => {
    e.preventDefault();
    e.stopPropagation();

    const closingTabIndex = openTabs.findIndex((t) => t.id === tabIdToClose);
    if (closingTabIndex === -1) return;

    const remainingTabs = openTabs.filter((tab) => tab.id !== tabIdToClose);

    // If we are closing the currently active tab, route to a fallback first.
    if (currentPath === tabIdToClose) {
      const fallbackIndex = Math.max(closingTabIndex - 1, 0);
      const newActiveTab = remainingTabs[fallbackIndex] || null;
      skipAutoOpenPathRef.current = tabIdToClose;

      // If no tab remains, move to empty state.
      if (!newActiveTab) {
        navigate('/');
      } else {
        navigate(newActiveTab.id);
      }
    }

    // After (potentially) setting the new active tab, remove the closed tab from the list.
    closeTab(tabIdToClose);
  };

  const sidebarContent = (
    <Box sx={{ width: DRAWER_WIDTH, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <List sx={{ flex: 1, overflowY: 'auto' }}>
        {menuItems.map((menu) => (
          <React.Fragment key={menu.label}>
            <ListItem
              button
              onClick={() => menu.isParent ? menu.setOpen(!menu.isOpen) : handleMenuItemClick(menu.path)}
              selected={!menu.isParent && currentPath === menu.path}
              sx={
                !menu.isParent && currentPath === menu.path
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
        ))}
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
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="toggle menu"
            edge="start"
            onClick={toggleSidebar}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1, cursor: 'pointer' }} onClick={() => handleMenuItemClick('/')}>
            <Button color="primary" sx={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
              BARO
            </Button>
          </Box>
          {devBypass && devProfile?.label ? (
            <Box
              sx={{
                px: 1.2,
                py: 0.4,
                borderRadius: 1,
                bgcolor: '#E7F0FF',
                color: 'primary.main',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              {`DEV | ${devProfile.label}`}
            </Box>
          ) : null}
        </Toolbar>
      </AppBar>

      <Snackbar
        open={!!notification}
        onClose={dismissNotification}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ mt: '64px' }}
      >
        <Alert
          onClose={dismissNotification}
          severity={notification?.type || 'info'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {notification?.message || ''}
        </Alert>
      </Snackbar>

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
            value={openTabs.some((tab) => tab.id === currentPath) ? currentPath : false}
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
            {openTabs.map((tab) => (
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
          {openTabs.length > 0 ? <Outlet /> : null}
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


