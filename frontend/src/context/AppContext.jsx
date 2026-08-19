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
const DEFAULT_UNSAVED_CHANGES_CONFIRM_MESSAGE = '저장되지 않은 변경사항이 있습니다. 저장하지 않고 이동하시겠습니까?';

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
  const unsavedGuardsRef = useRef(new Map());

  const openTab = useCallback((tab, options) => {
    setOpenTabs((prev) => {
      let tabs = prev;
      let changed = false;
      const pattern = options?.replacePrefix;
      let replacementIndex = -1;

      // If a replacement pattern is given, first remove old tabs matching it.
      if (pattern) {
        const removedTabs = tabs.filter((t) => t.id.startsWith(pattern));
        replacementIndex = tabs.findIndex((t) => t.id.startsWith(pattern));
        removedTabs.forEach((removedTab) => {
          const removedPath = String(removedTab?.id || '').trim();
          if (!removedPath) return;
          Array.from(unsavedGuardsRef.current.keys()).forEach((guardKey) => {
            const guard = unsavedGuardsRef.current.get(guardKey);
            if (!guard || String(guard.path || '').trim() !== removedPath) return;
            unsavedGuardsRef.current.delete(guardKey);
          });
        });
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
        if (replacementIndex >= 0) {
          tabs = [
            ...tabs.slice(0, replacementIndex),
            tab,
            ...tabs.slice(replacementIndex),
          ];
        } else {
          // A tab opened from within another tab's screen (e.g. a "단가"
          // button on the customer list opening the pricing tab) is a child
          // of the tab the user was on, not an unrelated new tab. Place it
          // immediately after that origin tab instead of at the far end of
          // the tab strip, so it doesn't jump past unrelated tabs opened
          // earlier (A, B open -> opening C from A gives A, C, B).
          const insertAfterId = options?.insertAfterId;
          const insertAfterIndex = insertAfterId
            ? tabs.findIndex((t) => t.id === insertAfterId)
            : -1;
          tabs = insertAfterIndex >= 0
            ? [
                ...tabs.slice(0, insertAfterIndex + 1),
                tab,
                ...tabs.slice(insertAfterIndex + 1),
              ]
            : [...tabs, tab];
        }
      }

      return changed ? tabs : prev;
    });
  }, []);

  const markTabChanged = useCallback((tabId) => {
    const normalizedTabId = String(tabId || '').trim();
    if (!normalizedTabId) return;
    setOpenTabs((prev) => {
      let changed = false;
      const next = prev.map((tab) => {
        if (tab.id !== normalizedTabId || tab.hasExternalChanges) return tab;
        changed = true;
        return { ...tab, hasExternalChanges: true };
      });
      return changed ? next : prev;
    });
  }, []);

  const clearTabChanged = useCallback((tabId) => {
    const normalizedTabId = String(tabId || '').trim();
    if (!normalizedTabId) return;
    setOpenTabs((prev) => {
      let changed = false;
      const next = prev.map((tab) => {
        if (tab.id !== normalizedTabId || !tab.hasExternalChanges) return tab;
        changed = true;
        const { hasExternalChanges: _hasExternalChanges, ...rest } = tab;
        return rest;
      });
      return changed ? next : prev;
    });
  }, []);

  const closeTab = useCallback((tabId) => {
    const normalizedTabId = String(tabId || '').trim();
    if (normalizedTabId) {
      Array.from(unsavedGuardsRef.current.keys()).forEach((guardKey) => {
        const guard = unsavedGuardsRef.current.get(guardKey);
        if (!guard || String(guard.path || '').trim() !== normalizedTabId) return;
        unsavedGuardsRef.current.delete(guardKey);
      });
    }
    setOpenTabs((prevOpenTabs) => {
      const nextTabs = prevOpenTabs.filter((t) => t.id !== tabId);
      return nextTabs.length === prevOpenTabs.length ? prevOpenTabs : nextTabs;
    });
  }, []);

  const resetWorkspace = useCallback(() => {
    setOpenTabs([]);
    setSidebarOpen(false);
    setNotification(null);
    unsavedGuardsRef.current.clear();
  }, []);

  const setUnsavedChangesGuard = useCallback((guardKey, options = {}) => {
    const key = String(guardKey || '').trim();
    if (!key) return;
    const isDirty = Boolean(options?.isDirty);
    if (!isDirty) {
      unsavedGuardsRef.current.delete(key);
      return;
    }
    unsavedGuardsRef.current.set(key, {
      isDirty: true,
      message:
        typeof options?.message === 'string' ? options.message.trim() : '',
      path: typeof options?.path === 'string' ? options.path.trim() : '',
    });
  }, []);

  const clearUnsavedChangesGuard = useCallback((guardKey) => {
    const key = String(guardKey || '').trim();
    if (!key) return;
    unsavedGuardsRef.current.delete(key);
  }, []);

  const hasUnsavedChanges = useCallback((options = {}) => {
    const targetPath = typeof options?.path === 'string' ? options.path.trim() : '';
    if (!targetPath) {
      return Array.from(unsavedGuardsRef.current.values()).some((guard) => guard?.isDirty);
    }
    return Array.from(unsavedGuardsRef.current.values()).some(
      (guard) => guard?.isDirty && String(guard?.path || '').trim() === targetPath
    );
  }, []);

  const confirmDiscardUnsavedChanges = useCallback((options = {}) => {
    const fallbackMessage =
      typeof options?.message === 'string' ? options.message.trim() : '';
    const targetPath = typeof options?.path === 'string' ? options.path.trim() : '';
    const dirtyGuards = Array.from(unsavedGuardsRef.current.values()).filter((guard) => {
      if (!guard?.isDirty) return false;
      if (!targetPath) return true;
      return String(guard?.path || '').trim() === targetPath;
    });
    if (dirtyGuards.length === 0) return true;
    if (typeof window === 'undefined') return true;
    const messageFromGuard = dirtyGuards
      .map((guard) => String(guard?.message || '').trim())
      .find(Boolean);
    const confirmMessage =
      fallbackMessage ||
      messageFromGuard ||
      DEFAULT_UNSAVED_CHANGES_CONFIRM_MESSAGE;
    return window.confirm(confirmMessage);
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
      markTabChanged,
      clearTabChanged,
      resetWorkspace,
      setFactories,
      setRoles,
      navigateToPath,
      setNavigateToPath,
      setUnsavedChangesGuard,
      clearUnsavedChangesGuard,
      hasUnsavedChanges,
      confirmDiscardUnsavedChanges,
    }),
    [
      clearUnsavedChangesGuard,
      clearTabChanged,
      closeTab,
      confirmDiscardUnsavedChanges,
      dismissNotification,
      hasUnsavedChanges,
      navigateToPath,
      markTabChanged,
      openTab,
      resetWorkspace,
      setUnsavedChangesGuard,
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
