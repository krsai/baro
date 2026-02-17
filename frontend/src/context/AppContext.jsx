import React, { createContext, useContext, useState, useCallback } from 'react';

// Create the App Context
const AppContext = createContext();

// AppProvider component
export const AppProvider = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // --- Tab State ---
  const [openTabs, setOpenTabs] = useState([
    { id: '/', label: '대시보드', path: '/' },
  ]);

  const openTab = useCallback((tab, options) => {
    setOpenTabs((prev) => {
      let tabs = [...prev];
      const pattern = options?.replacePrefix;

      // If a replacement pattern is given, first remove old tabs matching it.
      if (pattern) {
        tabs = tabs.filter(t => !t.id.startsWith(pattern));
      }

      // Now, add the new tab if it's not already in the (potentially filtered) list.
      const tabExists = tabs.some(t => t.id === tab.id);
      if (!tabExists) {
        tabs = [...tabs, tab];
      }
      
      // If the new tab was one of the ones filtered out, this logic re-adds it.
      // If it wasn't filtered and already existed, the list remains the same.
      // If it's brand new, it gets added.
      return tabs;
    });
  }, []);

  const closeTab = useCallback((tabId) => {
    setOpenTabs((prevOpenTabs) =>
      prevOpenTabs.filter((t) => t.id !== tabId)
    );
  }, []);

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
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const [factories, setFactories] = useState([]);

  const [roles, setRoles] = useState([
    { id: 1, name: '관리자', description: '전사 관리 권한' },
    { id: 2, name: '운영자', description: '공장 운영 관리' },
    { id: 3, name: '매니저', description: '팀 매니저' },
    { id: 4, name: '작업자', description: '일반 작업자' },
  ]);

  // Centralized navigation handler to be implemented in MainLayout
  const [navigateToPath, setNavigateToPath] = useState(() => () =>
    console.warn('navigateToPath is not implemented')
  );

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

    // Tab state
    openTabs,
    openTab,
    closeTab,

    // Factories state
    factories,
    setFactories,

    // Roles state
    roles,
    setRoles,

    // Centralized navigation
    navigateToPath,
    setNavigateToPath,
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
