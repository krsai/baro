import { loadStyles } from './localData';
import { normalizeProcesses } from './processTime';
import { buildQueryString, createHttpError, requestJSON } from './apiClient';
const STYLE_MIGRATION_KEY = 'baro_style_migrated_to_api_v1';

let migrationPromise = null;

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const normalizeStyle = (value = {}) => ({
  id: value.id || '',
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

const fetchStylesFromServer = async (options = {}) => {
  const data = await requestJSON(
    `/styles${buildQueryString({
      orgId: options.orgId,
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
  const orgIdNum = Number(options?.orgId);
  const hasOrgFilter = Number.isFinite(orgIdNum);
  if (!hasOrgFilter) {
    await ensureStyleMigrationOnce();
  }
  return fetchStylesFromServer({
    orgId: hasOrgFilter ? orgIdNum : null,
    compact: Boolean(options?.compact),
  });
};

export const fetchStyleById = async (styleId) => {
  if (!styleId) {
    throw createHttpError('styleId is required', 400);
  }
  await ensureStyleMigrationOnce();
  const data = await requestJSON(`/styles/${encodeURIComponent(styleId)}`);
  return normalizeStyle(data);
};

export const createStyle = async (style) => {
  await ensureStyleMigrationOnce();
  const data = await requestJSON('/styles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeStyle(style)),
  });
  return normalizeStyle(data);
};

export const updateStyle = async (styleId, style) => {
  await ensureStyleMigrationOnce();
  const data = await requestJSON(`/styles/${encodeURIComponent(styleId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeStyle(style)),
  });
  return normalizeStyle(data);
};

export const deleteStyle = async (styleId) => {
  await ensureStyleMigrationOnce();
  await requestJSON(`/styles/${encodeURIComponent(styleId)}`, {
    method: 'DELETE',
  });
};
