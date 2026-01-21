import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import {
  AppBar,
  Toolbar,
  Button,
  Box,
  Container,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
  Collapse,
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

const DRAWER_WIDTH = 260;

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, logout } = useAuth();
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useApp();
  const [adminOpen, setAdminOpen] = useState(false);
  const [basicInfoOpen, setBasicInfoOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [productionOpen, setProductionOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const subMenuItems = [
    { label: '법인 관리', icon: <BusinessIcon />, path: '/company' },
    { label: '공장 관리', icon: <FactoryIcon />, path: '/factory' },
    { label: '직원 관리', icon: <GroupIcon />, path: '/employee' },
  ];

  const basicInfoSubMenuItems = [
    { label: '역할 관리', icon: <BadgeIcon />, path: '/role' },
    { label: '권한 관리', icon: <SecurityIcon />, path: '/permission' },
  ];

  const orderSubMenuItems = [
    { label: '고객 관리', icon: <PeopleIcon />, path: '/customer' },
    { label: '스타일 관리', icon: <StyleIcon />, path: '/style' },
  ];

  const productionSubMenuItems = [
    { label: '생산 현황', icon: <ProductionQuantityLimitsIcon />, path: '/production' },
    { label: '작업 기록', icon: <HistoryIcon />, path: '/work-history' },
  ];

  const handleMenuItemClick = (path) => {
    navigate(path);
    setSidebarOpen(false);
  };

  const sidebarContent = (
    <Box sx={{ width: DRAWER_WIDTH, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <List sx={{ flex: 1 }}>
        {/* 대시보드 */}
        <ListItem
          button
          onClick={() => handleMenuItemClick('/')}
          selected={location.pathname === '/'}
          sx={{
            backgroundColor:
              location.pathname === '/' ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
            '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' },
          }}
        >
          <ListItemIcon>
            <HomeIcon />
          </ListItemIcon>
          <ListItemText primary="대시보드" />
        </ListItem>

        {/* 주문 관리 (부모 메뉴) */}
        <ListItem
          button
          onClick={() => setOrderOpen(!orderOpen)}
          sx={{
            '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' },
          }}
        >
          <ListItemIcon>
            <ShoppingCartIcon />
          </ListItemIcon>
          <ListItemText primary="주문 관리" />
          {orderOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </ListItem>

        {/* 주문 관리 서브메뉴 */}
        <Collapse in={orderOpen} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {orderSubMenuItems.map((item) => (
              <ListItem
                button
                key={item.path}
                onClick={() => handleMenuItemClick(item.path)}
                selected={location.pathname === item.path}
                sx={{
                  pl: 4,
                  backgroundColor:
                    location.pathname === item.path ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
                  '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' },
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItem>
            ))}
          </List>
        </Collapse>

        {/* 생산 관리 (부모 메뉴) */}
        <ListItem
          button
          onClick={() => setProductionOpen(!productionOpen)}
          sx={{
            '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' },
          }}
        >
          <ListItemIcon>
            <ProductionQuantityLimitsIcon />
          </ListItemIcon>
          <ListItemText primary="생산 관리" />
          {productionOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </ListItem>

        {/* 생산 관리 서브메뉴 */}
        <Collapse in={productionOpen} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {productionSubMenuItems.map((item) => (
              <ListItem
                button
                key={item.path}
                onClick={() => handleMenuItemClick(item.path)}
                selected={location.pathname === item.path}
                sx={{
                  pl: 4,
                  backgroundColor:
                    location.pathname === item.path ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
                  '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' },
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItem>
            ))}
          </List>
        </Collapse>

        {/* 조직 관리 (부모 메뉴) */}
        <ListItem
          button
          onClick={() => setAdminOpen(!adminOpen)}
          sx={{
            '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' },
          }}
        >
          <ListItemIcon>
            <OrganizationIcon />
          </ListItemIcon>
          <ListItemText primary="조직 관리" />
          {adminOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </ListItem>

        {/* 조직 관리 서브메뉴 */}
        <Collapse in={adminOpen} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {subMenuItems.map((item) => (
              <ListItem
                button
                key={item.path}
                onClick={() => handleMenuItemClick(item.path)}
                selected={location.pathname === item.path}
                sx={{
                  pl: 4,
                  backgroundColor:
                    location.pathname === item.path ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
                  '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' },
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItem>
            ))}
          </List>
        </Collapse>

        {/* 기본 정보 (부모 메뉴) */}
        <ListItem
          button
          onClick={() => setBasicInfoOpen(!basicInfoOpen)}
          sx={{
            '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' },
          }}
        >
          <ListItemIcon>
            <InfoIcon />
          </ListItemIcon>
          <ListItemText primary="기본 정보" />
          {basicInfoOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </ListItem>

        {/* 기본 정보 서브메뉴 */}
        <Collapse in={basicInfoOpen} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {basicInfoSubMenuItems.map((item) => (
              <ListItem
                button
                key={item.path}
                onClick={() => handleMenuItemClick(item.path)}
                selected={location.pathname === item.path}
                sx={{
                  pl: 4,
                  backgroundColor:
                    location.pathname === item.path ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
                  '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' },
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItem>
            ))}
          </List>
        </Collapse>

        {/* 시스템 설정 */}
        <ListItem
          button
          onClick={() => handleMenuItemClick('/system-setting')}
          selected={location.pathname === '/system-setting'}
          sx={{
            backgroundColor:
              location.pathname === '/system-setting' ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
            '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' },
          }}
        >
          <ListItemIcon>
            <TuneIcon />
          </ListItemIcon>
          <ListItemText primary="시스템 설정" />
        </ListItem>
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
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Header */}
      <AppBar position="fixed" sx={{ zIndex: 1201 }}>
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="toggle menu"
            edge="start"
            onClick={toggleSidebar}
            sx={{ mr: 2, display: { sm: 'block', md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1, cursor: 'pointer' }} onClick={() => navigate('/')}>
            <Button color="inherit" sx={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
              BARO
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Sidebar - Desktop */}
      <Box
        sx={{
          display: { xs: 'none', md: 'block' },
          width: DRAWER_WIDTH,
          pt: '64px',
          position: 'fixed',
          height: '100vh',
          borderRight: '1px solid #ddd',
          backgroundColor: '#f5f5f5',
        }}
      >
        {sidebarContent}
      </Box>

      {/* Sidebar - Mobile */}
      <Drawer
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            pt: '64px',
          },
        }}
      >
        {sidebarContent}
      </Drawer>

      {/* Main Content */}
      <Box
        sx={{
          flex: 1,
          ml: { xs: 0, md: `${DRAWER_WIDTH}px` },
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ pt: '64px' }} /> {/* AppBar 높이만큼 spacing */}
        <Container maxWidth="lg" sx={{ flex: 1, py: 4 }}>
          <Outlet />
        </Container>

        {/* Footer */}
        <Box sx={{ py: 2, textAlign: 'center', borderTop: '1px solid #ddd', backgroundColor: '#f5f5f5' }}>
          <p>&copy; 2026 My App. All rights reserved.</p>
        </Box>
      </Box>
    </Box>
  );
};

export default MainLayout;
