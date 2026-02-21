export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const requestContext = {
  userEmail: '',
  orgId: null,
};

const networkLoadingListeners = new Set();
const activeNetworkRequestIds = new Set();
let networkRequestSequence = 0;
let networkLoadingStartedAt = null;

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
  if (!activeNetworkRequestIds.has(requestId)) return;
  activeNetworkRequestIds.delete(requestId);
  if (activeNetworkRequestIds.size === 0) {
    networkLoadingStartedAt = null;
  }
  emitNetworkLoadingChange();
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

export const requestJSON = async (path, options = {}) => {
  const { skipGlobalLoading = false, ...requestOptions } = options || {};
  const trackedRequestId = skipGlobalLoading ? null : beginTrackedRequest();

  // When the caller provides an AbortSignal (e.g. from a component's useEffect cleanup),
  // immediately clear the tracked request so the loading overlay disappears on navigation.
  if (trackedRequestId !== null && requestOptions.signal) {
    requestOptions.signal.addEventListener(
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

    return data;
  } finally {
    if (trackedRequestId !== null) {
      endTrackedRequest(trackedRequestId);
    }
  }
};
