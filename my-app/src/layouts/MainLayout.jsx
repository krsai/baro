import React, { useState } from 'react';
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
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import HomeIcon from '@mui/icons-material/Home';
import ProductionQuantityLimitsIcon from '@mui/icons-material/ProductionQuantityLimits';
import OrganizationIcon from '@mui/icons-material/AccountTree';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BusinessIcon from '@mui/icons-material/Business';
import FactoryIcon from '@mui/icons-material/Factory';
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

const DRAWER_WIDTH = 260;

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const {
    sidebarOpen,
    toggleSidebar,
    setSidebarOpen,
    openTabs,
    activeTab,
    openTab,
    closeTab,
    setActiveTab,
  } = useApp();

  const [adminOpen, setAdminOpen] = useState(false);
  const [basicInfoOpen, setBasicInfoOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [productionOpen, setProductionOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleMenuItemClick = (path, label) => {
    openTab({ id: path, label, path });
    navigate(path);
    if (window.innerWidth < 900) { // md breakpoint
      setSidebarOpen(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    navigate(newValue);
  };

  const handleCloseTab = (e, tabId) => {
    e.stopPropagation(); // Prevent tab selection when closing
    const newPath = closeTab(tabId);
    if (newPath) {
      navigate(newPath);
    }
  };

  const menuItems = [
    {
      label: '대시보드',
      icon: <HomeIcon />,
      path: '/',
      isParent: false,
    },
    {
      label: '주문 관리',
      icon: <ShoppingCartIcon />,
      isParent: true,
      isOpen: orderOpen,
      setOpen: setOrderOpen,
      children: [
        { label: '고객 관리', icon: <PeopleIcon />, path: '/customer' },
        { label: '스타일 관리', icon: <StyleIcon />, path: '/style' },
      ],
    },
    {
      label: '생산 관리',
      icon: <ProductionQuantityLimitsIcon />,
      isParent: true,
      isOpen: productionOpen,
      setOpen: setProductionOpen,
      children: [
        { label: '생산 현황', icon: <ProductionQuantityLimitsIcon />, path: '/production' },
        { label: '작업 기록', icon: <HistoryIcon />, path: '/work-history' },
      ],
    },
    {
      label: '조직 관리',
      icon: <OrganizationIcon />,
      isParent: true,
      isOpen: adminOpen,
      setOpen: setAdminOpen,
      children: [
        { label: '법인 관리', icon: <BusinessIcon />, path: '/company' },
        { label: '공장 관리', icon: <FactoryIcon />, path: '/factory' },
        { label: '직원 관리', icon: <GroupIcon />, path: '/employee' },
      ],
    },
    {
      label: '기본 정보',
      icon: <InfoIcon />,
      isParent: true,
      isOpen: basicInfoOpen,
      setOpen: setBasicInfoOpen,
      children: [
        { label: '역할 관리', icon: <BadgeIcon />, path: '/role' },
        { label: '권한 관리', icon: <SecurityIcon />, path: '/permission' },
      ],
    },
    {
      label: '시스템 설정',
      icon: <TuneIcon />,
      path: '/system-setting',
      isParent: false,
    },
  ];

  const sidebarContent = (
    <Box sx={{ width: DRAWER_WIDTH, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <List sx={{ flex: 1, overflowY: 'auto' }}>
        {menuItems.map((menu) => (
          <React.Fragment key={menu.label}>
            <ListItem
              button
              onClick={() => menu.isParent ? menu.setOpen(!menu.isOpen) : handleMenuItemClick(menu.path, menu.label)}
              selected={!menu.isParent && activeTab === menu.path}
            >
              <ListItemIcon>{menu.icon}</ListItemIcon>
              <ListItemText primary={menu.label} />
              {menu.isParent && (menu.isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />)}
            </ListItem>
            {menu.isParent && (
              <Collapse in={menu.isOpen} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {menu.children.map((child) => (
                    <ListItem
                      button
                      key={child.path}
                      onClick={() => handleMenuItemClick(child.path, child.label)}
                      selected={activeTab === child.path}
                      sx={{ pl: 4 }}
                    >
                      <ListItemIcon>{child.icon}</ListItemIcon>
                      <ListItemText primary={child.label} />
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
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'grey.100' }}>
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
          <Box sx={{ flexGrow: 1, cursor: 'pointer' }} onClick={() => handleMenuItemClick('/', '대시보드')}>
            <Button color="primary" sx={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
              BARO
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', top: '64px', height: 'calc(100% - 64px)', borderRight: '1px solid #ddd' },
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
          pl: { md: `${DRAWER_WIDTH}px` },
          pt: '64px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#f4f6f8' }}>
          <Tabs
            value={activeTab}
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
                    {tab.id !== '/' && (
                      <IconButton
                        component="span"
                        size="small"
                        onClick={(e) => handleCloseTab(e, tab.id)}
                        sx={{
                          ml: 0.5,
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

        <Box sx={{ flexGrow: 1, p: 3, overflow: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

export default MainLayout;