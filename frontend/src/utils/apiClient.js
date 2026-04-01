export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const requestContext = {
  userEmail: '',
  orgId: null,
};
const DEFAULT_REQUEST_SCOPE_GROUP = 'workspace';
const DEFAULT_GET_CACHE_TTL_MS = 45_000;
const getResponseCache = new Map();
const inFlightGetRequests = new Map();
const activeRequestScopeByGroup = new Map();
const activeRequestScopeEntriesByGroup = new Map();
const requestScopeSchedulerByGroup = new Map();
let requestScopeTaskSequence = 0;
let activeRequestScopeEntrySequence = 0;

// mutation 경로가 어떤 GET 캐시 prefix를 무효화하는지 정의
// 매핑되지 않은 경로는 fallback으로 전체 캐시 삭제
const CACHE_INVALIDATION_MAP = {
  '/assignment-board-state': ['/assignment-board', '/assignment-cards'],
  '/assignment-plans': ['/assignment-plans', '/assignment-board', '/assignment-plan-progress'],
  '/assignment-cards': ['/assignment-cards', '/assignment-board'],
  '/assignment-board-lines': ['/assignment-board'],
  '/line-assignments': ['/lines', '/line-workers'],
  '/line-workers': ['/line-workers'],
  '/lines': ['/lines', '/line-workers'],
  '/orders': ['/orders', '/order-parties', '/assignment-cards'],
  '/styles': ['/styles', '/assignment-cards'],
  '/work-orders': ['/work-orders', '/assignment-cards'],
};

const invalidateCacheByPath = (mutationPath) => {
  const normalizedPath = String(mutationPath || '').split('?')[0];
  const prefixesToInvalidate = Object.entries(CACHE_INVALIDATION_MAP)
    .filter(([key]) => normalizedPath.startsWith(key))
    .flatMap(([, prefixes]) => prefixes);

  if (prefixesToInvalidate.length === 0) {
    getResponseCache.clear();
    return;
  }

  for (const [key] of getResponseCache.entries()) {
    if (prefixesToInvalidate.some((prefix) => key.includes(prefix))) {
      getResponseCache.delete(key);
    }
  }
};

const networkLoadingListeners = new Set();
const activeNetworkRequests = new Map();
const trackedRequestAbortControllers = new Map();
let networkRequestSequence = 0;
let networkLoadingStartedAt = null;
const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;

const normalizeRequestScopeValue = (value) =>
  typeof value === 'string' ? value.trim() : '';

const normalizeRequestScopeGroup = (value) =>
  normalizeRequestScopeValue(value) || DEFAULT_REQUEST_SCOPE_GROUP;

const getRequestScopeSchedulerState = (groupId = DEFAULT_REQUEST_SCOPE_GROUP) => {
  const normalizedGroupId = normalizeRequestScopeGroup(groupId);
  let state = requestScopeSchedulerByGroup.get(normalizedGroupId);
  if (!state) {
    state = {
      groupId: normalizedGroupId,
      pending: [],
      running: new Map(),
    };
    requestScopeSchedulerByGroup.set(normalizedGroupId, state);
  }
  return state;
};

const getActiveRequestScope = (groupId = DEFAULT_REQUEST_SCOPE_GROUP) =>
  normalizeRequestScopeValue(activeRequestScopeByGroup.get(normalizeRequestScopeGroup(groupId)));

const recomputeActiveRequestScope = (groupId = DEFAULT_REQUEST_SCOPE_GROUP) => {
  const normalizedGroupId = normalizeRequestScopeGroup(groupId);
  const entries = activeRequestScopeEntriesByGroup.get(normalizedGroupId);
  if (!entries || entries.size === 0) {
    activeRequestScopeByGroup.delete(normalizedGroupId);
    return;
  }

  let winner = null;
  entries.forEach((entry) => {
    if (
      !winner ||
      entry.priority > winner.priority ||
      (entry.priority === winner.priority && entry.sequence > winner.sequence)
    ) {
      winner = entry;
    }
  });

  if (winner?.scopeId) {
    activeRequestScopeByGroup.set(normalizedGroupId, winner.scopeId);
    return;
  }
  activeRequestScopeByGroup.delete(normalizedGroupId);
};

const cleanupRequestScopeSchedulerState = (groupId = DEFAULT_REQUEST_SCOPE_GROUP) => {
  const normalizedGroupId = normalizeRequestScopeGroup(groupId);
  const state = requestScopeSchedulerByGroup.get(normalizedGroupId);
  if (!state) return;
  if (state.pending.length > 0) return;
  if (state.running.size > 0) return;
  if (activeRequestScopeByGroup.has(normalizedGroupId)) return;
  requestScopeSchedulerByGroup.delete(normalizedGroupId);
};

const pumpRequestScopeScheduler = (groupId = DEFAULT_REQUEST_SCOPE_GROUP) => {
  const normalizedGroupId = normalizeRequestScopeGroup(groupId);
  const state = requestScopeSchedulerByGroup.get(normalizedGroupId);
  if (!state) return;
  const tasksToStart = state.pending.splice(0);
  tasksToStart.forEach((task) => {
    state.running.set(task.id, task);

    const controller = new AbortController();
    task.controller = controller;

    Promise.resolve()
      .then(() => task.run(controller.signal))
      .then((result) => {
        task.resolve(result);
      })
      .catch((error) => {
        task.reject(error);
      })
      .finally(() => {
        if (state.running.get(task.id) === task) {
          state.running.delete(task.id);
        }
        task.controller = null;
        pumpRequestScopeScheduler(normalizedGroupId);
        cleanupRequestScopeSchedulerState(normalizedGroupId);
      });
  });
};

const scheduleScopedRequest = ({
  groupId = DEFAULT_REQUEST_SCOPE_GROUP,
  scopeId,
  run,
}) => {
  const normalizedGroupId = normalizeRequestScopeGroup(groupId);
  const normalizedScopeId = normalizeRequestScopeValue(scopeId);
  if (!normalizedScopeId) {
    return run();
  }

  return new Promise((resolve, reject) => {
    const state = getRequestScopeSchedulerState(normalizedGroupId);
    state.pending.push({
      id: `${normalizedGroupId}:${normalizedScopeId}:${++requestScopeTaskSequence}`,
      groupId: normalizedGroupId,
      scopeId: normalizedScopeId,
      sequence: requestScopeTaskSequence,
      controller: null,
      run,
      resolve,
      reject,
    });
    pumpRequestScopeScheduler(normalizedGroupId);
  });
};

export const setActiveRequestScope = (
  groupId = DEFAULT_REQUEST_SCOPE_GROUP,
  scopeId = '',
) => {
  activateRequestScope(groupId, '__legacy__', scopeId, 0);
};

export const clearActiveRequestScope = (groupId = DEFAULT_REQUEST_SCOPE_GROUP) => {
  deactivateRequestScope(groupId, '__legacy__');
};

export const activateRequestScope = (
  groupId = DEFAULT_REQUEST_SCOPE_GROUP,
  token,
  scopeId = '',
  priority = 0,
) => {
  const normalizedGroupId = normalizeRequestScopeGroup(groupId);
  const normalizedToken = normalizeRequestScopeValue(token);
  if (!normalizedToken) return;
  const normalizedScopeId = normalizeRequestScopeValue(scopeId);
  let entries = activeRequestScopeEntriesByGroup.get(normalizedGroupId);
  if (!entries) {
    entries = new Map();
    activeRequestScopeEntriesByGroup.set(normalizedGroupId, entries);
  }

  if (!normalizedScopeId) {
    entries.delete(normalizedToken);
    if (entries.size === 0) {
      activeRequestScopeEntriesByGroup.delete(normalizedGroupId);
    }
  } else {
    entries.set(normalizedToken, {
      scopeId: normalizedScopeId,
      priority: Number.isFinite(Number(priority)) ? Number(priority) : 0,
      sequence: ++activeRequestScopeEntrySequence,
    });
  }

  recomputeActiveRequestScope(normalizedGroupId);
  pumpRequestScopeScheduler(normalizedGroupId);
  cleanupRequestScopeSchedulerState(normalizedGroupId);
};

export const deactivateRequestScope = (
  groupId = DEFAULT_REQUEST_SCOPE_GROUP,
  token,
) => {
  const normalizedGroupId = normalizeRequestScopeGroup(groupId);
  const normalizedToken = normalizeRequestScopeValue(token);
  if (!normalizedToken) return;
  const entries = activeRequestScopeEntriesByGroup.get(normalizedGroupId);
  if (!entries) return;
  entries.delete(normalizedToken);
  if (entries.size === 0) {
    activeRequestScopeEntriesByGroup.delete(normalizedGroupId);
  }
  recomputeActiveRequestScope(normalizedGroupId);
  pumpRequestScopeScheduler(normalizedGroupId);
  cleanupRequestScopeSchedulerState(normalizedGroupId);
};

export const setRequestContext = (next = {}) => {
  const normalizedEmail =
    typeof next.userEmail === 'string' ? next.userEmail.trim().toLowerCase() : '';
  const parsedOrgId = Number(next.orgId);
  requestContext.userEmail = normalizedEmail;
  requestContext.orgId = Number.isFinite(parsedOrgId) && parsedOrgId > 0 ? parsedOrgId : null;
};

export const getRequestContext = () => ({
  userEmail: requestContext.userEmail,
  orgId: requestContext.orgId,
});

const getNetworkLoadingScopesSnapshot = () => {
  const scopeCounts = new Map();
  activeNetworkRequests.forEach(({ groupId, scopeId }) => {
    const normalizedGroupId = normalizeRequestScopeGroup(groupId);
    const normalizedScopeId = normalizeRequestScopeValue(scopeId);
    if (!normalizedScopeId) return;
    const key = `${normalizedGroupId}::${normalizedScopeId}`;
    const current = scopeCounts.get(key);
    if (current) {
      current.activeRequestCount += 1;
      return;
    }
    scopeCounts.set(key, {
      groupId: normalizedGroupId,
      scopeId: normalizedScopeId,
      activeRequestCount: 1,
    });
  });
  return Array.from(scopeCounts.values());
};

const getNetworkLoadingSnapshot = () => ({
  isLoading: activeNetworkRequests.size > 0,
  activeRequestCount: activeNetworkRequests.size,
  startedAt: networkLoadingStartedAt,
  scopes: getNetworkLoadingScopesSnapshot(),
  updatedAt: Date.now(),
});

const emitNetworkLoadingChange = () => {
  const snapshot = getNetworkLoadingSnapshot();
  networkLoadingListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (_error) {
      // ignore listener errors so request lifecycle is not interrupted
    }
  });
};

const beginTrackedRequest = ({ groupId = '', scopeId = '' } = {}) => {
  const nextId = ++networkRequestSequence;
  activeNetworkRequests.set(nextId, {
    groupId: normalizeRequestScopeGroup(groupId),
    scopeId: normalizeRequestScopeValue(scopeId),
  });
  if (activeNetworkRequests.size === 1) {
    networkLoadingStartedAt = Date.now();
  }
  emitNetworkLoadingChange();
  return nextId;
};

const endTrackedRequest = (requestId) => {
  trackedRequestAbortControllers.delete(requestId);
  if (!activeNetworkRequests.has(requestId)) return;
  activeNetworkRequests.delete(requestId);
  if (activeNetworkRequests.size === 0) {
    networkLoadingStartedAt = null;
  }
  emitNetworkLoadingChange();
};

export const cancelAllTrackedRequests = (reason = 'cancelled') => {
  activeRequestScopeEntriesByGroup.clear();
  requestScopeSchedulerByGroup.forEach((state) => {
    state.pending.splice(0).forEach((task) => {
      task.reject(
        createHttpError('request cancelled', 499, {
          reason,
        })
      );
    });
    state.running.forEach((task) => {
      try {
        if (!task.controller?.signal?.aborted) {
          task.controller.abort(reason);
        }
      } catch (_error) {
        // ignore abort failures
      }
    });
  });
  activeRequestScopeByGroup.clear();
  trackedRequestAbortControllers.forEach((controller) => {
    try {
      if (!controller?.signal?.aborted) {
        controller.abort(reason);
      }
    } catch (_error) {
      // ignore abort failures
    }
  });
  trackedRequestAbortControllers.clear();
  if (activeNetworkRequests.size > 0) {
    activeNetworkRequests.clear();
    networkLoadingStartedAt = null;
    emitNetworkLoadingChange();
  }
};

export const subscribeNetworkLoading = (listener) => {
  if (typeof listener !== 'function') return () => {};
  networkLoadingListeners.add(listener);
  listener(getNetworkLoadingSnapshot());
  return () => {
    networkLoadingListeners.delete(listener);
  };
};

export const buildQueryString = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    query.set(key, String(value));
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
};

export const createHttpError = (message, status, details = null) => {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
};

const cloneResponseData = (data) => {
  if (data === null || data === undefined) return data;
  if (typeof structuredClone === 'function') return structuredClone(data);
  return JSON.parse(JSON.stringify(data));
};

const normalizeHeadersKey = (headersInit = {}) => {
  const headers = new Headers(headersInit || {});
  const entries = [];
  headers.forEach((value, key) => {
    entries.push(`${key.toLowerCase()}:${value}`);
  });
  entries.sort();
  return entries.join('|');
};

const purgeExpiredGetCache = () => {
  const now = Date.now();
  for (const [key, entry] of getResponseCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      getResponseCache.delete(key);
    }
  }
};

export const requestJSON = async (path, options = {}) => {
  const {
    skipGlobalLoading = false,
    skipCache = false,
    forceRefresh = false,
    cacheTtlMs = DEFAULT_GET_CACHE_TTL_MS,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    requestScheduler = null,
    ...requestOptions
  } = options || {};
  const method = String(requestOptions.method || 'GET')
    .trim()
    .toUpperCase();
  const hasExternalAbortSignal = Boolean(requestOptions.signal);
  const shouldUseCache = method === 'GET' && !skipCache;
  const shouldShareInFlight = shouldUseCache && !hasExternalAbortSignal;
  const normalizedCacheTtl = Number(cacheTtlMs);
  const effectiveCacheTtl =
    Number.isFinite(normalizedCacheTtl) && normalizedCacheTtl > 0
      ? normalizedCacheTtl
      : DEFAULT_GET_CACHE_TTL_MS;
  const schedulerGroupId = normalizeRequestScopeGroup(
    requestScheduler?.groupId ?? DEFAULT_REQUEST_SCOPE_GROUP
  );
  const schedulerScopeId = normalizeRequestScopeValue(
    requestScheduler?.scopeId ?? getActiveRequestScope(schedulerGroupId)
  );
  const shouldScheduleByScope = method === 'GET' && Boolean(schedulerScopeId);
  const cacheKey = shouldUseCache
    ? [
        method,
        String(path || '').trim(),
        `org:${requestContext.orgId || ''}`,
        `user:${requestContext.userEmail || ''}`,
        `headers:${normalizeHeadersKey(requestOptions.headers)}`,
      ].join('::')
    : '';
  const inFlightKey =
    shouldUseCache && shouldScheduleByScope
      ? `${cacheKey}::scope:${schedulerGroupId}:${schedulerScopeId}`
      : cacheKey;

  if (shouldUseCache) {
    purgeExpiredGetCache();
    if (!forceRefresh) {
      const cached = getResponseCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cloneResponseData(cached.data);
      }
      if (shouldShareInFlight) {
        const inFlight = inFlightGetRequests.get(inFlightKey);
        if (inFlight) {
          const shared = await inFlight;
          return cloneResponseData(shared);
        }
      }
    }
  }

  const execute = async (schedulerSignal = null) => {
    const trackedRequestId = skipGlobalLoading
      ? null
      : beginTrackedRequest({
          groupId: schedulerGroupId,
          scopeId: schedulerScopeId,
        });
    const timeoutMsRaw = Number(requestTimeoutMs);
    const timeoutMs =
      Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
        ? Math.trunc(timeoutMsRaw)
        : DEFAULT_REQUEST_TIMEOUT_MS;
    const mergedAbortController = new AbortController();
    let timeoutId = null;
    let onExternalAbort = null;
    let onSchedulerAbort = null;

    if (requestOptions.signal) {
      if (requestOptions.signal.aborted) {
        mergedAbortController.abort(requestOptions.signal.reason);
      } else {
        onExternalAbort = () => {
          mergedAbortController.abort(requestOptions.signal.reason);
        };
        requestOptions.signal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    if (schedulerSignal) {
      if (schedulerSignal.aborted) {
        mergedAbortController.abort(schedulerSignal.reason);
      } else {
        onSchedulerAbort = () => {
          mergedAbortController.abort(schedulerSignal.reason);
        };
        schedulerSignal.addEventListener('abort', onSchedulerAbort, { once: true });
      }
    }

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        if (!mergedAbortController.signal.aborted) {
          mergedAbortController.abort('request_timeout');
        }
      }, timeoutMs);
    }

    if (trackedRequestId !== null) {
      trackedRequestAbortControllers.set(trackedRequestId, mergedAbortController);
    }

    // When the caller provides an AbortSignal (e.g. from a component's useEffect cleanup),
    // immediately clear the tracked request so the loading overlay disappears on navigation.
    if (trackedRequestId !== null) {
      mergedAbortController.signal.addEventListener(
        'abort',
        () => endTrackedRequest(trackedRequestId),
        { once: true },
      );
    }

    try {
      const headers = new Headers(requestOptions.headers || {});
      if (requestContext.userEmail && !headers.has('x-user-email')) {
        headers.set('x-user-email', requestContext.userEmail);
      }
      if (requestContext.orgId && !headers.has('x-org-id')) {
        headers.set('x-org-id', String(requestContext.orgId));
      }

      const response = await fetch(`${API_BASE}${path}`, {
        ...requestOptions,
        signal: mergedAbortController.signal,
        headers,
      });
      const raw = await response.text();
      let data = null;

      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch (_error) {
          data = raw;
        }
      }

      if (!response.ok) {
        const message =
          typeof data?.error === 'string'
            ? data.error
            : `Request failed (${response.status})`;
        throw createHttpError(message, response.status, data);
      }

      if (method !== 'GET') {
        // Mutating requests invalidate related cached GET responses.
        invalidateCacheByPath(path);
      }

      return data;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw createHttpError('request cancelled', 499, {
          reason: mergedAbortController.signal?.reason || null,
        });
      }
      throw error;
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      if (requestOptions.signal && onExternalAbort) {
        requestOptions.signal.removeEventListener('abort', onExternalAbort);
      }
      if (schedulerSignal && onSchedulerAbort) {
        schedulerSignal.removeEventListener('abort', onSchedulerAbort);
      }
      if (trackedRequestId !== null) {
        endTrackedRequest(trackedRequestId);
      }
    }
  };

  if (!shouldUseCache) {
    return shouldScheduleByScope
      ? scheduleScopedRequest({
          groupId: schedulerGroupId,
          scopeId: schedulerScopeId,
          run: execute,
        })
      : execute();
  }

  const networkPromise = shouldScheduleByScope
    ? scheduleScopedRequest({
        groupId: schedulerGroupId,
        scopeId: schedulerScopeId,
        run: execute,
      })
    : execute();
  if (shouldShareInFlight) {
    inFlightGetRequests.set(inFlightKey, networkPromise);
  }
  try {
    const data = await networkPromise;
    getResponseCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + effectiveCacheTtl,
    });
    return cloneResponseData(data);
  } finally {
    if (shouldShareInFlight) {
      inFlightGetRequests.delete(inFlightKey);
    }
  }
};
