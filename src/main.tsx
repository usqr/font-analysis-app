import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import './index.css';
import { App } from './components/App';
import { IS_STATIC } from './lib/env';

// GitHub Pages has no SPA fallback, so the static build keeps routes in the hash.
const Router = IS_STATIC ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
