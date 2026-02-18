import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import { fetchAttributes } from '../utils/attributeApi';

// Create the App Context
const AppContext = createContext();

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

  // Helper to show notifications
  const showNotification = useCallback((message, type = 'info', duration = 3000) => {
    setNotification({ message, type, id: Date.now() });
    if (duration) {
      setTimeout(() => setNotification(null), duration);
    }
  }, []);


  // Helper to dismiss notification
  const dismissNotification = useCallback(() => {
    setNotification(null);
  }, []);

  // Toggle sidebar
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const [factories, setFactories] = useState([]);

  const [roles, setRoles] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const loadRoles = async () => {
      try {
        const data = await fetchAttributes();
        const roleRows = Array.isArray(data?.roles) ? data.roles : [];
        if (cancelled || roleRows.length === 0) return;
        setRoles(
          roleRows.map((role) => ({
            id: role.id,
            name: role.name || role.code || '',
            description: role.code || '',
          }))
        );
      } catch (_error) {
        // keep empty roles on failure
      }
    };
    loadRoles();
    return () => {
      cancelled = true;
    };
  }, []);

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

