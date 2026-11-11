import React from 'react';
import ReactDOM from 'react-dom/client';
// Bundle Manrope locally so the popup stays within Chrome's strict extension
// CSP (no third-party stylesheets from fonts.googleapis.com).
import '@fontsource-variable/manrope';
import './style.css';
import App from './App.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
