import React from 'react';
import ReactDOM from 'react-dom/client';

// Global Styles: Load these before App to ensure base styles are applied first
import './styles/base.css';
import './styles/theme.css';
import './styles/layout.css';
import './styles/table.css';
import './styles/form.css';
import App from './App';

const CHUNK_RECOVERY_KEY = 'baro:chunk-recovery-at';
const CHUNK_RECOVERY_COOLDOWN_MS = 60_000;
const DYNAMIC_IMPORT_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /chunkloaderror/i,
  /loading chunk [\w-]+ failed/i,
];

const normalizeErrorMessage = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value?.message === 'string') return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const isDynamicImportError = (value) => {
  const message = normalizeErrorMessage(value);
  return DYNAMIC_IMPORT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

const shouldAttemptChunkRecovery = () => {
  try {
    const raw = sessionStorage.getItem(CHUNK_RECOVERY_KEY);
    const lastAttemptAt = Number(raw);
    if (!Number.isFinite(lastAttemptAt)) return true;
    return Date.now() - lastAttemptAt > CHUNK_RECOVERY_COOLDOWN_MS;
  } catch {
    return true;
  }
};

const attemptChunkRecoveryReload = () => {
  if (!shouldAttemptChunkRecovery()) return;
  try {
    sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures and proceed to reload for best-effort recovery.
  }
  window.location.reload();
};

window.addEventListener('error', (event) => {
  const candidate = event?.error || event?.message || event;
  if (isDynamicImportError(candidate)) {
    attemptChunkRecoveryReload();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (!isDynamicImportError(event?.reason)) return;
  event.preventDefault?.();
  attemptChunkRecoveryReload();
});

window.addEventListener(
  'contextmenu',
  (event) => {
    event.preventDefault();
  },
  { capture: true }
);

const resolveCanonicalOrigin = () => {
  const raw = String(import.meta.env.VITE_CANONICAL_ORIGIN || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
};

const canonicalOrigin = resolveCanonicalOrigin();
if (import.meta.env.PROD && canonicalOrigin && window.location.origin !== canonicalOrigin) {
  window.location.replace(
    `${canonicalOrigin}${window.location.pathname}${window.location.search}${window.location.hash}`
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
