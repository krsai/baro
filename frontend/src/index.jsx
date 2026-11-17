import React from 'react';
import ReactDOM from 'react-dom/client';

// Global Styles: Load these before App to ensure base styles are applied first
import './styles/base.css';
import './styles/theme.css';
import './styles/layout.css';
import './styles/table.css';
import './styles/form.css';
import App from './App';

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
} else {
  // Storage (including the selected language) belongs to an origin. Do not
  // briefly render with this origin's defaults while moving to the real app.
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
