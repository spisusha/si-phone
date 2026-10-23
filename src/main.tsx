import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { initTheme } from './telegram/theme';

// Тему ставим до первого рендера, чтобы не мигал белый экран в тёмном Telegram.
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
