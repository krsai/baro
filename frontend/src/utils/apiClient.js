export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const requestContext = {
  userEmail: '',
  orgId: null,
};
const DEFAULT_GET_CACHE_TTL_MS = 45_000;
const getResponseCache = new Map();
const inFlightGetRequests = new Map();

const networkLoadingListeners = new Set();
const activeNetworkRequestIds = new Set();
const trackedRequestAbortControllers = new Map();
let networkRequestSequence = 0;
let networkLoadingStartedAt = null;
const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;

export const setRequestContext = (next = {}) => {
  const normalizedEmail =
    typeof next.userEmail === 'string' ? next.userEmail.trim().toLowerCase() : '';
  const parsedOrgId = Number(next.orgId);
  requestContext.userEmail = normalizedEmail;
  requestContext.orgId = Number.isFinite(parsedOrgId) && parsedOrgId > 0 ? parsedOrgId : null;
};

const getNetworkLoadingSnapshot = () => ({
  isLoading: activeNetworkRequestIds.size > 0,
  activeRequestCount: activeNetworkRequestIds.size,
  startedAt: networkLoadingStartedAt,
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

const beginTrackedRequest = () => {
  const nextId = ++networkRequestSequence;
  activeNetworkRequestIds.add(nextId);
  if (activeNetworkRequestIds.size === 1) {
    networkLoadingStartedAt = Date.now();
  }
  emitNetworkLoadingChange();
  return nextId;
};

const endTrackedRequest = (requestId) => {
  trackedRequestAbortControllers.delete(requestId);
  if (!activeNetworkRequestIds.has(requestId)) return;
  activeNetworkRequestIds.delete(requestId);
  if (activeNetworkRequestIds.size === 0) {
    networkLoadingStartedAt = null;
  }
  emitNetworkLoadingChange();
};

export const cancelAllTrackedRequests = (reason = 'cancelled') => {
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
  if (activeNetworkRequestIds.size > 0) {
    activeNetworkRequestIds.clear();
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
    ...requestOptions
  } = options || {};
  const method = String(requestOptions.method || 'GET')
    .trim()
    .toUpperCase();
  const shouldUseCache = method === 'GET' && !skipCache;
  const normalizedCacheTtl = Number(cacheTtlMs);
  const effectiveCacheTtl =
    Number.isFinite(normalizedCacheTtl) && normalizedCacheTtl > 0
      ? normalizedCacheTtl
      : DEFAULT_GET_CACHE_TTL_MS;
  const cacheKey = shouldUseCache
    ? [
        method,
        String(path || '').trim(),
        `org:${requestContext.orgId || ''}`,
        `user:${requestContext.userEmail || ''}`,
        `headers:${normalizeHeadersKey(requestOptions.headers)}`,
      ].join('::')
    : '';

  if (shouldUseCache) {
    purgeExpiredGetCache();
    if (!forceRefresh) {
      const cached = getResponseCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cloneResponseData(cached.data);
      }
      const inFlight = inFlightGetRequests.get(cacheKey);
      if (inFlight) {
        const shared = await inFlight;
        return cloneResponseData(shared);
      }
    }
  }

  const execute = async () => {
    const trackedRequestId = skipGlobalLoading ? null : beginTrackedRequest();
    const timeoutMsRaw = Number(requestTimeoutMs);
    const timeoutMs =
      Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
        ? Math.trunc(timeoutMsRaw)
        : DEFAULT_REQUEST_TIMEOUT_MS;
    const mergedAbortController = new AbortController();
    let timeoutId = null;
    let onExternalAbort = null;

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
        // Mutating requests invalidate cached GET responses to keep views consistent.
        getResponseCache.clear();
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
      if (trackedRequestId !== null) {
        endTrackedRequest(trackedRequestId);
      }
    }
  };

  if (!shouldUseCache) {
    return execute();
  }

  const networkPromise = execute();
  inFlightGetRequests.set(cacheKey, networkPromise);
  try {
    const data = await networkPromise;
    getResponseCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + effectiveCacheTtl,
    });
    return cloneResponseData(data);
  } finally {
    inFlightGetRequests.delete(cacheKey);
  }
};
