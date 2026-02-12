import { loadStyles } from './localData';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const STYLE_MIGRATION_KEY = 'baro_style_migrated_to_api_v1';

let migrationPromise = null;

const toError = (message, status) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

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
  processes: normalizeArray(value.processes),
  bom: normalizeArray(value.bom),
  bomNotes: value.bomNotes || '',
  createdAt: value.createdAt || null,
  updatedAt: value.updatedAt || null,
});

const requestJSON = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data?.error === 'string'
        ? data.error
        : `Request failed (${response.status})`;
    throw toError(message, response.status);
  }
  return data;
};

const fetchStylesFromServer = async () => {
  const data = await requestJSON('/styles');
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

export const fetchStyles = async () => {
  await ensureStyleMigrationOnce();
  return fetchStylesFromServer();
};

export const fetchStyleById = async (styleId) => {
  if (!styleId) {
    throw toError('styleId is required', 400);
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
