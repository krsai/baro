export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

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
  const response = await fetch(`${API_BASE}${path}`, options);
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
};
