import { requestJSON } from '../../../utils/apiClient';

export const loadWorkLogs = async () => {
  const data = await requestJSON('/work-logs');
  return Array.isArray(data) ? data : [];
};

export const appendWorkLog = async (payload) => {
  return requestJSON('/work-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
};

export const findWorkLogById = async (workLogId) => {
  if (!workLogId) return null;
  try {
    return await requestJSON(`/work-logs/${encodeURIComponent(workLogId)}`);
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
};

export const updateWorkLog = async (workLogId, payload) => {
  if (!workLogId) return null;
  try {
    return await requestJSON(`/work-logs/${encodeURIComponent(workLogId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
};

export const deleteWorkLog = async (workLogId) => {
  if (!workLogId) return false;
  try {
    await requestJSON(`/work-logs/${encodeURIComponent(workLogId)}`, {
      method: 'DELETE',
    });
    return true;
  } catch (error) {
    if (error?.status === 404) return false;
    throw error;
  }
};
