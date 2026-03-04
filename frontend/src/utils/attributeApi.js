import { buildQueryString, requestJSON } from './apiClient';

const ATTRIBUTE_CACHE_TTL_MS = 30 * 1000;
const attributesCache = new Map();
const attributesInFlight = new Map();

const normalizeArray = (value) => (Array.isArray(value) ? value : []);
const toPositiveOrgId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const normalizePayType = (value) => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === 'CT' || normalized === 'FIXED' ? normalized : null;
};
const normalizeSortOrder = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeAttributeItem = (item = {}) => ({
  id: item.id ?? null,
  code: String(item.code ?? '').trim(),
  name: String(item.name ?? '').trim(),
  defaultPayType: normalizePayType(item.defaultPayType),
  sortOrder: normalizeSortOrder(item.sortOrder),
});

const mergeAttributeItem = (items = [], nextItem) => {
  const normalizedNextItem = normalizeAttributeItem(nextItem);
  const nextId = Number(normalizedNextItem.id);
  const nextCode = String(normalizedNextItem.code || '').trim();
  let replaced = false;

  const mergedItems = normalizeArray(items).map((item) => {
    const normalizedItem = normalizeAttributeItem(item);
    const itemId = Number(normalizedItem.id);
    const sameId =
      Number.isInteger(nextId) &&
      nextId > 0 &&
      Number.isInteger(itemId) &&
      itemId === nextId;
    const sameCode = Boolean(nextCode) && normalizedItem.code === nextCode;
    if (!sameId && !sameCode) return normalizedItem;
    replaced = true;
    return normalizedNextItem;
  });

  if (replaced) return mergedItems;
  return [...mergedItems, normalizedNextItem];
};

const normalizeAttributes = (data = {}) => ({
  colors: normalizeArray(data?.colors).map(normalizeAttributeItem),
  categories: normalizeArray(data?.categories).map(normalizeAttributeItem),
  roles: normalizeArray(data?.roles).map(normalizeAttributeItem),
  processes: normalizeArray(data?.processes).map(normalizeAttributeItem),
  canManageProcesses: data?.canManageProcesses !== false,
});

const normalizePartialAttributes = (data = {}) => {
  const normalized = {};
  if (Array.isArray(data?.colors)) {
    normalized.colors = data.colors.map(normalizeAttributeItem);
  }
  if (Array.isArray(data?.categories)) {
    normalized.categories = data.categories.map(normalizeAttributeItem);
  }
  if (Array.isArray(data?.roles)) {
    normalized.roles = data.roles.map(normalizeAttributeItem);
  }
  if (Array.isArray(data?.processes)) {
    normalized.processes = data.processes.map(normalizeAttributeItem);
  }
  if (typeof data?.canManageProcesses === 'boolean') {
    normalized.canManageProcesses = data.canManageProcesses;
  }
  return normalized;
};

const normalizeAttributePayload = (payload = {}) => {
  const normalized = {};
  const keys = ['colors', 'categories', 'roles', 'processes'];
  keys.forEach((key) => {
    if (!Array.isArray(payload?.[key])) return;
    normalized[key] = payload[key].map((item = {}) => ({
      id: item.id ?? undefined,
      code: String(item.code ?? '').trim(),
      name: String(item.name ?? '').trim(),
      ...(key === 'roles'
        ? {
            defaultPayType: normalizePayType(item.defaultPayType) ?? 'FIXED',
            sortOrder: normalizeSortOrder(item.sortOrder),
          }
        : {}),
    }));
  });
  return normalized;
};

const toAttributeCacheKey = (orgId, hasOrgFilter) =>
  hasOrgFilter ? `org:${orgId}` : 'global';

const readFreshAttributesCache = (cacheKey) => {
  const cached = attributesCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > ATTRIBUTE_CACHE_TTL_MS) {
    attributesCache.delete(cacheKey);
    return null;
  }
  return cached.data;
};

const writeAttributesCache = (cacheKey, data) => {
  attributesCache.set(cacheKey, {
    data: normalizeAttributes(data),
    timestamp: Date.now(),
  });
};

export const fetchAttributes = async (options = {}) => {
  const orgId = toPositiveOrgId(options?.orgId);
  const hasOrgFilter = orgId !== null;
  const forceRefresh = Boolean(options?.forceRefresh);
  const skipGlobalLoading = Boolean(options?.skipGlobalLoading);
  const cacheKey = toAttributeCacheKey(orgId, hasOrgFilter);

  if (!forceRefresh) {
    const cached = readFreshAttributesCache(cacheKey);
    if (cached) return cached;
    const inflight = attributesInFlight.get(cacheKey);
    if (inflight) return inflight;
  }

  const requestPromise = (async () => {
    const data = await requestJSON(
      `/attributes${buildQueryString({
        orgId: hasOrgFilter ? orgId : undefined,
      })}`,
      { skipGlobalLoading }
    );
    const normalized = normalizeAttributes(data);
    writeAttributesCache(cacheKey, normalized);
    return normalized;
  })();

  attributesInFlight.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    attributesInFlight.delete(cacheKey);
  }
};

export const updateAttributes = async (payload, options = {}) => {
  const orgId = toPositiveOrgId(options?.orgId);
  const hasOrgFilter = orgId !== null;
  const cacheKey = toAttributeCacheKey(orgId, hasOrgFilter);
  const body = normalizeAttributePayload(payload);
  const data = await requestJSON(
    `/attributes${buildQueryString({
      orgId: hasOrgFilter ? orgId : undefined,
    })}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const normalizedPartial = normalizePartialAttributes(data);
  const previous = readFreshAttributesCache(cacheKey);
  if (previous) {
    const merged = {
      ...previous,
      ...normalizedPartial,
    };
    writeAttributesCache(cacheKey, merged);
  } else {
    attributesCache.delete(cacheKey);
  }
  attributesInFlight.delete(cacheKey);
  return normalizedPartial;
};

export const createColorAttribute = async (payload, options = {}) => {
  const orgId = toPositiveOrgId(options?.orgId);
  const hasOrgFilter = orgId !== null;
  const cacheKey = toAttributeCacheKey(orgId, hasOrgFilter);
  const body = {
    code: String(payload?.code ?? '').trim(),
    name: String(payload?.name ?? '').trim(),
  };
  const data = await requestJSON(
    `/attributes/colors${buildQueryString({
      orgId: hasOrgFilter ? orgId : undefined,
    })}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const normalizedColor = normalizeAttributeItem(data);
  const previous = readFreshAttributesCache(cacheKey);
  if (previous) {
    writeAttributesCache(cacheKey, {
      ...previous,
      colors: mergeAttributeItem(previous.colors, normalizedColor),
    });
  } else {
    attributesCache.delete(cacheKey);
  }
  attributesInFlight.delete(cacheKey);
  return normalizedColor;
};

export const fetchProcessAttributes = async (options = {}) => {
  const data = await fetchAttributes(options);
  return data.processes;
};
