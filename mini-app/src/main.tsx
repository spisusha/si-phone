import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { initTheme } from './telegram/theme';
import { initTelegram } from './telegram/telegramWebApp';

// ready() — как можно раньше, чтобы Telegram убрал заглушку загрузки;
// тему — до первого рендера, чтобы не мигал белый экран в тёмном Telegram.
initTelegram();
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
