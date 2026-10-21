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

  const setTabEditing = useCallback((tabId, editing) => {
    setOpenTabs((tabs) => {
      if (!tabs.some((tab) => tab.id === tabId && Boolean(tab.isEditing) !== Boolean(editing))) return tabs;
      return tabs.map((tab) => tab.id === tabId ? { ...tab, isEditing: Boolean(editing) } : tab);
    });
  }, []);

  const openTab = useCallback((tab, options) => {
    tab = { ...tab, isEditing: Array.from(unsavedGuardsRef.current.values()).some(guard => guard.isDirty && guard.path === tab.id) };
    setOpenTabs((prev) => {
      if (options?.updateOnly && !prev.some(item => item.id === tab.id)) return prev;
      let tabs = prev;
      let changed = false;
      const pattern = options?.updateOnly ? null : options?.replacePrefix ||
        (tab.id.startsWith('/outsourcing-record/') ? '/outsourcing-record/' : null);
      let replacementIndex = -1;

      // If a replacement pattern is given, first remove old tabs matching it.
      if (pattern) {
        const removedTabs = tabs.filter((t) => t.id !== tab.id && t.id.startsWith(pattern));
        replacementIndex = tabs.findIndex((t) => t.id !== tab.id && t.id.startsWith(pattern));
        removedTabs.forEach((removedTab) => {
          const removedPath = String(removedTab?.id || '').trim();
          if (!removedPath) return;
          Array.from(unsavedGuardsRef.current.keys()).forEach((guardKey) => {
            const guard = unsavedGuardsRef.current.get(guardKey);
            if (!guard || String(guard.path || '').trim() !== removedPath) return;
            unsavedGuardsRef.current.delete(guardKey);
          });
        });
        const filtered = tabs.filter((t) => t.id === tab.id || !t.id.startsWith(pattern));
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
        if (existingTab.path !== nextPath || existingTab.label !== nextLabel || Boolean(existingTab.isEditing) !== tab.isEditing) {
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
        // Route-driven opens also arrive here without navigation options. Keep
        // create/detail tabs next to their closest open list, regardless of
        // which unrelated tabs were opened later.
        const pathname = String(tab.id).split(/[?#]/)[0].replace(/\/$/, '');
        const parentTab = tabs.reduce((closest, candidate) => {
          const candidatePath = String(candidate.id).split(/[?#]/)[0].replace(/\/$/, '');
          if (!candidatePath || !pathname.startsWith(`${candidatePath}/`)) return closest;
          return !closest || candidatePath.length > closest.path.length
            ? { id: candidate.id, path: candidatePath }
            : closest;
        }, null);
        const insertAfterId = parentTab?.id || options?.insertAfterId;
        const insertAfterIndex = insertAfterId
          ? tabs.findIndex((item) => item.id === insertAfterId)
          : -1;
        if (insertAfterIndex >= 0) {
          tabs = [
            ...tabs.slice(0, insertAfterIndex + 1),
            tab,
            ...tabs.slice(insertAfterIndex + 1),
          ];
        } else if (replacementIndex >= 0) {
          tabs = [
            ...tabs.slice(0, replacementIndex),
            tab,
            ...tabs.slice(replacementIndex),
          ];
        } else {
          // No open parent or origin: append an independent tab.
          tabs = [...tabs, tab];
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

  const syncEditingTabs = useCallback(() => {
    const dirtyPaths = new Set(Array.from(unsavedGuardsRef.current.values()).filter(g => g.isDirty).map(g => g.path));
    setOpenTabs(tabs => {
      if (tabs.every(tab => Boolean(tab.isEditing) === dirtyPaths.has(tab.id))) return tabs;
      return tabs.map(tab => ({ ...tab, isEditing: dirtyPaths.has(tab.id) }));
    });
  }, []);

  const setUnsavedChangesGuard = useCallback((guardKey, options = {}) => {
    const key = String(guardKey || '').trim();
    if (!key) return;
    const isDirty = Boolean(options?.isDirty);
    if (!isDirty) {
      unsavedGuardsRef.current.delete(key);
      syncEditingTabs();
      return;
    }
    unsavedGuardsRef.current.set(key, {
      isDirty: true,
      message:
        typeof options?.message === 'string' ? options.message.trim() : '',
      path: typeof options?.path === 'string' ? options.path.trim() : '',
    });
    syncEditingTabs();
  }, [syncEditingTabs]);

  const clearUnsavedChangesGuard = useCallback((guardKey) => {
    const key = String(guardKey || '').trim();
    if (!key) return;
    unsavedGuardsRef.current.delete(key);
    syncEditingTabs();
  }, [syncEditingTabs]);

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
      setTabEditing,
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
      setTabEditing,
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
