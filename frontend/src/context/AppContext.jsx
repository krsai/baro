import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
} from 'react';

const AppStateContext = createContext(null);
const AppActionsContext = createContext(null);

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

      const existingIndex = tabs.findIndex((t) => t.id === tab.id);
      if (existingIndex >= 0) {
        const existingTab = tabs[existingIndex];
        const nextPath = tab.path ?? existingTab.path;
        const nextLabel = tab.label ?? existingTab.label;
        if (existingTab.path !== nextPath || existingTab.label !== nextLabel) {
          changed = true;
          tabs = tabs.map((item, index) =>
            index === existingIndex
              ? {
                  ...item,
                  ...tab,
                  path: nextPath,
                  label: nextLabel,
                }
              : item
          );
        }
      } else {
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

  const stateValue = useMemo(
    () => ({
      isLoading,
      notification,
      sidebarOpen,
      openTabs,
      factories,
      roles,
    }),
    [
      factories,
      isLoading,
      notification,
      openTabs,
      roles,
      sidebarOpen,
    ]
  );

  const actionsValue = useMemo(
    () => ({
      setIsLoading,
      showNotification,
      dismissNotification,
      setSidebarOpen,
      toggleSidebar,
      openTab,
      closeTab,
      resetWorkspace,
      setFactories,
      setRoles,
      navigateToPath,
      setNavigateToPath,
    }),
    [
      closeTab,
      dismissNotification,
      navigateToPath,
      openTab,
      resetWorkspace,
      setNavigateToPath,
      showNotification,
      toggleSidebar,
    ]
  );

  return (
    <AppActionsContext.Provider value={actionsValue}>
      <AppStateContext.Provider value={stateValue}>
        {children}
      </AppStateContext.Provider>
    </AppActionsContext.Provider>
  );
};

export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within an AppProvider');
  }
  return context;
};

export const useAppActions = () => {
  const context = useContext(AppActionsContext);
  if (!context) {
    throw new Error('useAppActions must be used within an AppProvider');
  }
  return context;
};
