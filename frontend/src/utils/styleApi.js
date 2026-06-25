import { normalizeProcesses } from './processTime';
import { buildQueryString, createHttpError, requestJSON } from './apiClient';
import {
  emitWorkspaceDataChanged,
  WORKSPACE_DATA_TOPICS,
} from './workspaceDataEvents';

const STYLE_BY_ID_CACHE_TTL_MS = 30 * 1000;

const styleByIdCache = new Map();
const styleByIdInFlight = new Map();

const normalizeArray = (value) => (Array.isArray(value) ? value : []);
const toPositiveOrgId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const toStyleCacheKey = (styleId, options = {}) => {
  const key = String(styleId || '');
  if (!key) return '';
  const orgId = toPositiveOrgId(options?.orgId);
  const ownerOrgId = toPositiveOrgId(options?.ownerOrgId);
  return `${orgId || 'global'}:${ownerOrgId || 'any'}:${key}`;
};

const normalizeStyle = (value = {}) => ({
  id: value.id || '',
  ownerOrgId: toPositiveOrgId(value.ownerOrgId ?? value.customerOrgId),
  ownerOrgName: value.ownerOrgName || '',
  customerOrgId: toPositiveOrgId(value.customerOrgId ?? value.ownerOrgId),
  styleCode: value.styleCode || '',
  name: value.name || '',
  customer: value.customer || '',
  customerNameKo: value.customerNameKo || '',
  customerNameVi: value.customerNameVi || '',
  registrationDate: value.registrationDate || '',
  designer: value.designer || '',
  collection: value.collection || '',
  season: value.season || '',
  imageUrls: normalizeArray(value.imageUrls),
  processes: normalizeProcesses(value.processes),
  bom: normalizeArray(value.bom),
  bomNotes: value.bomNotes || '',
  workRecordCount: Math.max(0, Number(value.workRecordCount) || 0),
  hasWorkRecords: Boolean(value.hasWorkRecords) || (Number(value.workRecordCount) || 0) > 0,
  createdAt: value.createdAt || null,
  updatedAt: value.updatedAt || null,
});

const readFreshStyleFromCache = (styleId, options = {}) => {
  const key = toStyleCacheKey(styleId, options);
  if (!key) return null;
  const cached = styleByIdCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > STYLE_BY_ID_CACHE_TTL_MS) {
    styleByIdCache.delete(key);
    return null;
  }
  return cached.style;
};

const writeStyleToCache = (style, options = {}) => {
  const key = toStyleCacheKey(style?.id, {
    orgId: options?.orgId,
    ownerOrgId: style?.ownerOrgId ?? style?.customerOrgId ?? options?.ownerOrgId,
  });
  if (!key) return;
  styleByIdCache.set(key, {
    style: normalizeStyle(style),
    timestamp: Date.now(),
  });
};

const removeStyleFromCache = (styleId, options = {}) => {
  const normalizedStyleId = String(styleId || '');
  if (!normalizedStyleId) return;

  const scopedKey = toStyleCacheKey(normalizedStyleId, options);
  if (scopedKey) {
    styleByIdCache.delete(scopedKey);
  }

  const suffix = `:${normalizedStyleId}`;
  Array.from(styleByIdCache.keys()).forEach((cacheKey) => {
    if (cacheKey.endsWith(suffix)) {
      styleByIdCache.delete(cacheKey);
    }
  });
};

const fetchStylesFromServer = async (options = {}) => {
  const data = await requestJSON(
    `/styles${buildQueryString({
      orgId: options.orgId,
      ownerOrgId: options.ownerOrgId,
      compact: options.compact ? 1 : undefined,
    })}`,
    {
      forceRefresh: Boolean(options?.forceRefresh),
      skipGlobalLoading: Boolean(options?.skipGlobalLoading),
      skipCache: Boolean(options?.skipCache),
      signal: options?.signal,
    }
  );
  if (!Array.isArray(data)) return [];
  return data.map(normalizeStyle);
};

export const fetchStyles = async (options = {}) => {
  const orgIdNum = toPositiveOrgId(options?.orgId);
  const styles = await fetchStylesFromServer({
    orgId: orgIdNum,
    ownerOrgId: toPositiveOrgId(options?.ownerOrgId),
    compact: Boolean(options?.compact),
    forceRefresh: Boolean(options?.forceRefresh),
    skipGlobalLoading: Boolean(options?.skipGlobalLoading),
    skipCache: Boolean(options?.skipCache),
    signal: options?.signal,
  });
  styles.forEach((style) => {
    writeStyleToCache(style, {
      orgId: orgIdNum,
      ownerOrgId: style?.ownerOrgId ?? style?.customerOrgId,
    });
  });
  return styles;
};

export const fetchStyleById = async (styleId, options = {}) => {
  if (!styleId) {
    throw createHttpError('styleId is required', 400);
  }

  const key = String(styleId);
  const cacheKey = toStyleCacheKey(key, options);
  const forceRefresh = Boolean(options?.forceRefresh);

  if (!forceRefresh) {
    const cachedStyle = readFreshStyleFromCache(key, options);
    if (cachedStyle) {
      return cachedStyle;
    }
    const existingPromise = styleByIdInFlight.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }
  }

  const requestPromise = (async () => {
    const query = buildQueryString({
      orgId: toPositiveOrgId(options?.orgId),
      ownerOrgId: toPositiveOrgId(options?.ownerOrgId),
    });
    const data = await requestJSON(`/styles/${encodeURIComponent(key)}${query}`, {
      skipGlobalLoading: Boolean(options?.skipGlobalLoading),
    });
    const normalized = normalizeStyle(data);
    writeStyleToCache(normalized, {
      orgId: toPositiveOrgId(options?.orgId),
      ownerOrgId: toPositiveOrgId(options?.ownerOrgId),
    });
    return normalized;
  })();

  styleByIdInFlight.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    styleByIdInFlight.delete(cacheKey);
  }
};

export const createStyle = async (style, options = {}) => {
  const query = buildQueryString({
    orgId: toPositiveOrgId(options?.orgId),
  });
  const data = await requestJSON(`/styles${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeStyle(style)),
  });
  const normalized = normalizeStyle(data);
  writeStyleToCache(normalized, {
    orgId: toPositiveOrgId(options?.orgId),
    ownerOrgId: normalized?.ownerOrgId ?? normalized?.customerOrgId,
  });
  emitWorkspaceDataChanged({
    topics: [WORKSPACE_DATA_TOPICS.STYLES],
    orgId: toPositiveOrgId(options?.orgId),
    styleIds: [normalized?.id],
  });
  return normalized;
};

export const updateStyle = async (styleId, style, options = {}) => {
  const query = buildQueryString({
    orgId: toPositiveOrgId(options?.orgId),
    ownerOrgId: toPositiveOrgId(options?.ownerOrgId),
  });
  const data = await requestJSON(`/styles/${encodeURIComponent(styleId)}${query}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeStyle(style)),
  });
  const normalized = normalizeStyle(data);
  writeStyleToCache(normalized, {
    orgId: toPositiveOrgId(options?.orgId),
    ownerOrgId: normalized?.ownerOrgId ?? normalized?.customerOrgId,
  });
  emitWorkspaceDataChanged({
    topics: [WORKSPACE_DATA_TOPICS.STYLES],
    orgId: toPositiveOrgId(options?.orgId),
    styleIds: [normalized?.id || styleId],
  });
  return normalized;
};

export const deleteStyle = async (styleId, options = {}) => {
  const query = buildQueryString({
    orgId: toPositiveOrgId(options?.orgId),
    ownerOrgId: toPositiveOrgId(options?.ownerOrgId),
  });
  await requestJSON(`/styles/${encodeURIComponent(styleId)}${query}`, {
    method: 'DELETE',
  });
  removeStyleFromCache(styleId, {
    orgId: toPositiveOrgId(options?.orgId),
    ownerOrgId: toPositiveOrgId(options?.ownerOrgId),
  });
  emitWorkspaceDataChanged({
    topics: [WORKSPACE_DATA_TOPICS.STYLES],
    orgId: toPositiveOrgId(options?.orgId),
    styleIds: [styleId],
  });
};
