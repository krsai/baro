import React, { createContext, useContext, useState } from 'react';

// Create the App Context
const AppContext = createContext();

// AppProvider component
export const AppProvider = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [factories, setFactories] = useState([
    {
      id: 1,
      name: '하노이 공장',
      address: '하노이 홍방구 123번지',
      countryCode: '+84',
      phoneNumber: '24-1234-5678',
      manager: '응우옌 반 A',
    },
    {
      id: 2,
      name: '호치민 공장',
      address: '호치민시 1구 456번지',
      countryCode: '+84',
      phoneNumber: '28-2345-6789',
      manager: '팜 진 B',
    },
    {
      id: 3,
      name: '서울 공장',
      address: '서울시 강남구 테헤란로 789',
      countryCode: '+82',
      phoneNumber: '2-5678-9012',
      manager: '이순신',
    },
  ]);

  const [roles, setRoles] = useState([
    { id: 1, name: '관리자', description: '전사 관리 권한', category: 'position' },
    { id: 2, name: '운영자', description: '공장 운영 관리', category: 'position' },
    { id: 3, name: '매니저', description: '팀 매니저', category: 'position' },
    { id: 4, name: '작업자', description: '일반 작업자', category: 'position' },
    { id: 5, name: '봉제', description: '봉제 작업', category: 'job' },
    { id: 6, name: '다림질', description: '다림질 작업', category: 'job' },
    { id: 7, name: '포장', description: '포장 작업', category: 'job' },
    { id: 8, name: '시다', description: '시다 보조', category: 'job' },
  ]);

  // Helper to show notifications
  const showNotification = (message, type = 'info', duration = 3000) => {
    setNotification({ message, type, id: Date.now() });
    if (duration) {
      setTimeout(() => setNotification(null), duration);
    }
  };

  // Helper to dismiss notification
  const dismissNotification = () => {
    setNotification(null);
  };

  // Toggle sidebar
  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  const value = {
    // Loading state
    isLoading,
    setIsLoading,

    // Notification state
    notification,
    showNotification,
    dismissNotification,

    // Sidebar state
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,

    // Factories state
    factories,
    setFactories,

    // Roles state
    roles,
    setRoles,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// useApp hook
export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
