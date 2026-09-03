import React from 'react';
import ReactDOM from 'react-dom/client';
// Bundle Manrope locally so the popup stays within Chrome's strict extension
// CSP (no third-party stylesheets from fonts.googleapis.com).
import '@fontsource-variable/manrope';
// Register the <iconify-icon> web component once. It's tree-shakeable but
// side-effectful on import — every icon in the popup relies on this line.
import 'iconify-icon';
import './style.css';
import App from './App.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
