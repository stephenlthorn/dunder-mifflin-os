import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/app.css';
import './styles/map.css';
import './styles/windows.css';
import './styles/calendar.css';
import './styles/minutes.css';
import './styles/overlays.css';
import './styles/list.css';
import './styles/observability.css';
import './styles/needsYou.css';
import './styles/controls.css';
import './styles/delight.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
