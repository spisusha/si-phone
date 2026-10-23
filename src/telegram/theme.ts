import { getTelegramColorScheme, onTelegramThemeChanged } from './telegramWebApp';

// Тема магазина: ставит атрибуты на <html>, по ним работают токены в styles/theme.css.
// Решение Романа (23.10.2026): цвета — как в теме Telegram у пользователя;
// вне Telegram — по настройке телефона.

const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

let lockedLight = false;

export function applyTheme(): void {
  const html = document.documentElement;
  const mode = lockedLight ? 'light' : 'auto';
  const scheme = mode === 'auto'
    ? (getTelegramColorScheme() ?? (systemDark() ? 'dark' : 'light'))
    : mode;
  html.dataset.theme = mode;
  html.dataset.scheme = scheme;
}

// Админка свёрстана только под светлую схему — на её время держим светлую.
export function lockLightTheme(): () => void {
  lockedLight = true;
  applyTheme();
  return () => {
    lockedLight = false;
    applyTheme();
  };
}

export function initTheme(): void {
  applyTheme();
  onTelegramThemeChanged(applyTheme);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
}
