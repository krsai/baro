import { buildQueryString, requestJSON } from '../../../utils/apiClient';

const buildReadRequestOptions = (options = {}) => ({
  skipGlobalLoading: Boolean(options?.skipGlobalLoading),
  skipCache: Boolean(options?.skipCache),
  forceRefresh: Boolean(options?.forceRefresh),
  ...(options?.signal ? { signal: options.signal } : {}),
  ...(options?.cacheTtlMs ? { cacheTtlMs: options.cacheTtlMs } : {}),
  ...(options?.requestTimeoutMs ? { requestTimeoutMs: options.requestTimeoutMs } : {}),
});

export const loadWorkLogs = async (options = {}) => {
  const query = buildQueryString({
    orgId: options?.orgId,
    factoryId: options?.factoryId,
    workDate: options?.workDate,
    dateFrom: options?.dateFrom,
    dateTo: options?.dateTo,
    includeRecords:
      options?.includeRecords === undefined ? undefined : options.includeRecords ? 1 : 0,
  });
  const data = await requestJSON('/work-logs' + query, buildReadRequestOptions(options));
  return Array.isArray(data) ? data : [];
};

export const appendWorkLog = async (payload, options = {}) => {
  const query = buildQueryString({ orgId: options?.orgId });
  return requestJSON('/work-logs' + query, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
};

export const findWorkLogById = async (workLogId, options = {}) => {
  if (!workLogId) return null;
  try {
    const query = buildQueryString({
      orgId: options?.orgId,
      includeContext:
        options?.includeContext === undefined ? undefined : options.includeContext ? 1 : 0,
    });
    return await requestJSON(
      `/work-logs/${encodeURIComponent(workLogId)}` + query,
      buildReadRequestOptions(options)
    );
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
};

export const loadWorkLogContext = async (options = {}) => {
  const query = buildQueryString({
    orgId: options?.orgId,
    factoryId: options?.factoryId,
    lineId: options?.lineId,
    workDate: options?.workDate,
    coverageStartDate: options?.coverageStartDate,
    debug: options?.debug ? 1 : undefined,
  });
  return requestJSON(`/work-log-context${query}`, buildReadRequestOptions(options));
};

export const updateWorkLog = async (workLogId, payload, options = {}) => {
  if (!workLogId) return null;
  try {
    const query = buildQueryString({ orgId: options?.orgId });
    return await requestJSON(`/work-logs/${encodeURIComponent(workLogId)}` + query, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
};

export const deleteWorkLog = async (workLogId, options = {}) => {
  if (!workLogId) return false;
  try {
    const query = buildQueryString({ orgId: options?.orgId });
    await requestJSON(`/work-logs/${encodeURIComponent(workLogId)}` + query, {
      method: 'DELETE',
    });
    return true;
  } catch (error) {
    if (error?.status === 404) return false;
    throw error;
  }
};
