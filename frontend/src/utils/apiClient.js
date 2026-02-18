export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const networkLoadingListeners = new Set();
const activeNetworkRequestIds = new Set();
let networkRequestSequence = 0;
let networkLoadingStartedAt = null;

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

  try {
    const response = await fetch(`${API_BASE}${path}`, requestOptions);
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
