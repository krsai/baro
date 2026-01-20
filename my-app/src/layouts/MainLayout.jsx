import React from 'react';
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
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import HomeIcon from '@mui/icons-material/Home';
import PeopleIcon from '@mui/icons-material/People';
import LogoutIcon from '@mui/icons-material/Logout';

const DRAWER_WIDTH = 260;

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, logout } = useAuth();
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useApp();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { label: '대시보드', icon: <HomeIcon />, path: '/' },
    { label: '유저 관리', icon: <PeopleIcon />, path: '/users' },
  ];

  const handleMenuItemClick = (path) => {
    navigate(path);
    setSidebarOpen(false); // 모바일에서 메뉴 클릭 시 닫기
  };

  const sidebarContent = (
    <Box sx={{ width: DRAWER_WIDTH, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <List sx={{ flex: 1 }}>
        {menuItems.map((item) => (
          <ListItem
            button
            key={item.path}
            onClick={() => handleMenuItemClick(item.path)}
            selected={location.pathname === item.path}
            sx={{
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
