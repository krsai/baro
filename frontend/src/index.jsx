import React from 'react';
import ReactDOM from 'react-dom/client';

// Global Styles: Load these before App to ensure base styles are applied first
import './styles/base.css';
import './styles/theme.css';
import './styles/layout.css';
import './styles/table.css';
import './styles/form.css';
import App from './App';

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
