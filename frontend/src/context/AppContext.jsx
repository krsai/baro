import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
} from 'react';

// Create the App Context
const AppContext = createContext();

// 타입별 토스트 표시 시간 (ms) — 여기서 전역 관리
const TOAST_DURATION = {
  success: 3000,
  error: 5000,
  warning: 3500,
  info: 3000,
};

// AppProvider component
export const AppProvider = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // --- Tab State ---
  const [openTabs, setOpenTabs] = useState([]);

  const openTab = useCallback((tab, options) => {
    setOpenTabs((prev) => {
      let tabs = prev;
      let changed = false;
      const pattern = options?.replacePrefix;

      // If a replacement pattern is given, first remove old tabs matching it.
      if (pattern) {
        const filtered = tabs.filter((t) => !t.id.startsWith(pattern));
        if (filtered.length !== tabs.length) {
          changed = true;
          tabs = filtered;
        }
      }

      // Add the new tab only if it does not already exist.
      const tabExists = tabs.some((t) => t.id === tab.id);
      if (!tabExists) {
        changed = true;
        tabs = [...tabs, tab];
      }

      return changed ? tabs : prev;
    });
  }, []);

  const closeTab = useCallback((tabId) => {
    setOpenTabs((prevOpenTabs) => {
      const nextTabs = prevOpenTabs.filter((t) => t.id !== tabId);
      return nextTabs.length === prevOpenTabs.length ? prevOpenTabs : nextTabs;
    });
  }, []);

  const resetWorkspace = useCallback(() => {
    setOpenTabs([]);
    setSidebarOpen(false);
    setNotification(null);
  }, []);

  const notificationTimerRef = useRef(null);

  // Helper to show notifications
  const showNotification = useCallback((message, type = 'info') => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    setNotification({ message, type, id: Date.now() });
    const duration = TOAST_DURATION[type] ?? TOAST_DURATION.info;
    notificationTimerRef.current = setTimeout(() => {
      setNotification(null);
      notificationTimerRef.current = null;
    }, duration);
  }, []);


  // Helper to dismiss notification
  const dismissNotification = useCallback(() => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
      notificationTimerRef.current = null;
    }
    setNotification(null);
  }, []);

  // Toggle sidebar
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const [factories, setFactories] = useState([]);

  const [roles, setRoles] = useState([]);

  // Keep navigation handler in a ref to avoid function identity churn across renders.
  const navigateToPathRef = useRef((..._args) => {
    console.warn('navigateToPath is not implemented');
  });
  const navigateToPath = useCallback((...args) => navigateToPathRef.current(...args), []);
  const setNavigateToPath = useCallback((nextHandler) => {
    navigateToPathRef.current =
      typeof nextHandler === 'function'
        ? nextHandler
        : () => console.warn('navigateToPath is not implemented');
  }, []);

  const value = useMemo(
    () => ({
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
      resetWorkspace,

      // Factories state
      factories,
      setFactories,

      // Roles state
      roles,
      setRoles,

      // Centralized navigation
      navigateToPath,
      setNavigateToPath,
    }),
    [
      closeTab,
      dismissNotification,
      factories,
      isLoading,
      navigateToPath,
      notification,
      openTab,
      openTabs,
      resetWorkspace,
      roles,
      setNavigateToPath,
      showNotification,
      sidebarOpen,
      toggleSidebar,
    ]
  );

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
