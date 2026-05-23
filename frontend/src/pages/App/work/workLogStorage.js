import { buildQueryString, requestJSON } from '../../../utils/apiClient';

const buildReadRequestOptions = (options = {}) => ({
  skipGlobalLoading: Boolean(options?.skipGlobalLoading),
  skipCache: Boolean(options?.skipCache),
  forceRefresh: Boolean(options?.forceRefresh),
  ...(options?.signal ? { signal: options.signal } : {}),
  ...(options?.cacheTtlMs ? { cacheTtlMs: options.cacheTtlMs } : {}),
  ...(options?.requestTimeoutMs ? { requestTimeoutMs: options.requestTimeoutMs } : {}),
});
const toText = (value) => String(value || '').trim();
const buildAssignmentDisplayKey = (assignment) => {
  const orderNo = toText(assignment?.orderNo);
  const label = toText(assignment?.label || assignment?.styleId);
  const quantity = toText(assignment?.finalQuantity ?? assignment?.quantity);
  if (!orderNo && !label && !quantity) return '';
  return [orderNo, label, quantity].join('|');
};
const summarizeDuplicateAssignments = (assignments = []) => {
  const buckets = (Array.isArray(assignments) ? assignments : []).reduce((map, assignment) => {
    const displayKey = buildAssignmentDisplayKey(assignment);
    if (!displayKey) return map;
    const current = map.get(displayKey) || {
      displayKey,
      count: 0,
      assignmentIds: [],
      lineIds: [],
    };
    current.count += 1;
    const assignmentId = toText(assignment?.id || assignment?.externalId || assignment?.dbId);
    if (assignmentId) current.assignmentIds.push(assignmentId);
    const lineId = toText(assignment?.lineId);
    if (lineId) current.lineIds.push(lineId);
    map.set(displayKey, current);
    return map;
  }, new Map());

  return Array.from(buckets.values())
    .filter((entry) => entry.count > 1)
    .slice(0, 10);
};

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
  console.log('[loadWorkLogContext] called', {
    orgId: options?.orgId ?? null,
    factoryId: options?.factoryId ?? null,
    lineId: options?.lineId ?? null,
    workDate: options?.workDate ?? '',
    coverageStartDate: options?.coverageStartDate ?? '',
    debug: Boolean(options?.debug),
  });
  const query = buildQueryString({
    orgId: options?.orgId,
    factoryId: options?.factoryId,
    lineId: options?.lineId,
    workDate: options?.workDate,
    coverageStartDate: options?.coverageStartDate,
    debug: options?.debug ? 1 : undefined,
  });
  const result = await requestJSON(
    `/work-log-context${query}`,
    buildReadRequestOptions(options)
  );
  const workers = Array.isArray(result?.workers) ? result.workers : [];
  const assignments = Array.isArray(result?.assignments) ? result.assignments : [];
  console.log('[loadWorkLogContext] result', {
    workerCount: workers.length,
    assignmentCount: assignments.length,
    duplicateAssignments: summarizeDuplicateAssignments(assignments),
    previousCoverageEndDate: result?.previousCoverageEndDate ?? null,
    suggestedCoverageStartDate: result?.suggestedCoverageStartDate ?? null,
    isFirstLineWorkLog: Boolean(result?.isFirstLineWorkLog),
  });
  return result;
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
