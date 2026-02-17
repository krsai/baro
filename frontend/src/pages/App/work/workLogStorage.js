import { buildQueryString, requestJSON } from '../../../utils/apiClient';

export const loadWorkLogs = async (options = {}) => {
  const query = buildQueryString({ orgId: options?.orgId, factoryId: options?.factoryId });
  const data = await requestJSON('/work-logs' + query);
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
    const query = buildQueryString({ orgId: options?.orgId });
    return await requestJSON(`/work-logs/${encodeURIComponent(workLogId)}` + query);
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
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
