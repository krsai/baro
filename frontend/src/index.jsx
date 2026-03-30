import React from 'react';
import ReactDOM from 'react-dom/client';

// Global Styles: Load these before App to ensure base styles are applied first
import './styles/base.css';
import './styles/theme.css';
import './styles/layout.css';
import './styles/table.css';
import './styles/form.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
