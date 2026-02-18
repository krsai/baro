import { loadStyles } from './localData';
import { normalizeProcesses } from './processTime';
import { buildQueryString, createHttpError, requestJSON } from './apiClient';
const STYLE_MIGRATION_KEY = 'baro_style_migrated_to_api_v1';
const STYLE_BY_ID_CACHE_TTL_MS = 30 * 1000;

let migrationPromise = null;
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
  registrationDate: value.registrationDate || '',
  designer: value.designer || '',
  collection: value.collection || '',
  season: value.season || '',
  imageUrls: normalizeArray(value.imageUrls),
  processes: normalizeProcesses(value.processes),
  bom: normalizeArray(value.bom),
  bomNotes: value.bomNotes || '',
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

  // Also clear any stale entries for the same style id from other scopes.
  const suffix = `:${normalizedStyleId}`;
  Array.from(styleByIdCache.keys()).forEach((cacheKey) => {
    if (cacheKey.endsWith(suffix)) {
      styleByIdCache.delete(cacheKey);
    }
  });
};

const triggerStyleMigrationInBackground = () => {
  ensureStyleMigrationOnce().catch(() => {});
};

const fetchStylesFromServer = async (options = {}) => {
  const data = await requestJSON(
    `/styles${buildQueryString({
      orgId: options.orgId,
      ownerOrgId: options.ownerOrgId,
      compact: options.compact ? 1 : undefined,
    })}`
  );
  if (!Array.isArray(data)) return [];
  return data.map(normalizeStyle);
};

const importStylesToServer = async (styles) => {
  const data = await requestJSON('/styles/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ styles }),
  });
  if (!Array.isArray(data)) return [];
  return data.map(normalizeStyle);
};

export const ensureStyleMigrationOnce = async () => {
  if (typeof window === 'undefined') return;
  if (window.localStorage.getItem(STYLE_MIGRATION_KEY) === '1') return;
  if (migrationPromise) {
    await migrationPromise;
    return;
  }

  migrationPromise = (async () => {
    const localStyles = loadStyles().map(normalizeStyle);
    if (localStyles.length === 0) {
      window.localStorage.setItem(STYLE_MIGRATION_KEY, '1');
      return;
    }

    const serverStyles = await fetchStylesFromServer();
    if (serverStyles.length === 0) {
      try {
        await importStylesToServer(localStyles);
      } catch (error) {
        if (error?.status !== 409) {
          throw error;
        }
      }
    }

    window.localStorage.setItem(STYLE_MIGRATION_KEY, '1');
  })();

  try {
    await migrationPromise;
  } finally {
    migrationPromise = null;
  }
};

export const fetchStyles = async (options = {}) => {
  const orgIdNum = toPositiveOrgId(options?.orgId);
  const hasOrgFilter = orgIdNum !== null;
  if (!hasOrgFilter) {
    await ensureStyleMigrationOnce();
  }
  const styles = await fetchStylesFromServer({
    orgId: hasOrgFilter ? orgIdNum : null,
    ownerOrgId: toPositiveOrgId(options?.ownerOrgId),
    compact: Boolean(options?.compact),
  });
  styles.forEach((style) => {
    writeStyleToCache(style, {
      orgId: hasOrgFilter ? orgIdNum : null,
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

  const requestFromServer = async () => {
    const query = buildQueryString({
      orgId: toPositiveOrgId(options?.orgId),
      ownerOrgId: toPositiveOrgId(options?.ownerOrgId),
    });
    const data = await requestJSON(`/styles/${encodeURIComponent(key)}${query}`);
    const normalized = normalizeStyle(data);
    writeStyleToCache(normalized, {
      orgId: toPositiveOrgId(options?.orgId),
      ownerOrgId: toPositiveOrgId(options?.ownerOrgId),
    });
    return normalized;
  };

  const requestPromise = (async () => {
    if (options?.skipMigration) {
      return requestFromServer();
    }

    if (options?.waitForMigration) {
      await ensureStyleMigrationOnce();
      return requestFromServer();
    }

    const migrationTask = ensureStyleMigrationOnce().catch(() => null);
    try {
      return await requestFromServer();
    } catch (error) {
      if (error?.status !== 404) {
        throw error;
      }
      await migrationTask;
      return requestFromServer();
    }
  })();

  styleByIdInFlight.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    styleByIdInFlight.delete(cacheKey);
  }
};

export const createStyle = async (style, options = {}) => {
  triggerStyleMigrationInBackground();
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
  return normalized;
};

export const updateStyle = async (styleId, style, options = {}) => {
  triggerStyleMigrationInBackground();
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
  return normalized;
};

export const deleteStyle = async (styleId, options = {}) => {
  triggerStyleMigrationInBackground();
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
};
