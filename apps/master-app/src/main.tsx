import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@amber/ui/styles.css';

import App from './App.js';
import './app.css';
import './i18n/index.js';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
