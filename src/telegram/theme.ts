import { getTelegramColorScheme, onTelegramThemeChanged } from './telegramWebApp';

// Тема магазина: ставит атрибуты на <html>, по ним работают токены в styles/theme.css.
// По умолчанию — «Авто»: как в теме Telegram у пользователя (вне Telegram — как на телефоне).
// В профиле можно выбрать светлую или тёмную вручную; выбор хранится на этом устройстве.
export type ThemeMode = 'auto' | 'light' | 'dark';

const LS_KEY = 'si_theme';
const MODES: readonly ThemeMode[] = ['auto', 'light', 'dark'];

const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

let lockedLight = false;

export function getThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(LS_KEY) as ThemeMode | null;
    return v && MODES.includes(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function setThemeMode(mode: ThemeMode): void {
  try {
    if (mode === 'auto') localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, mode);
  } catch { /* приватный режим — выбор просто не запомнится */ }
  applyTheme();
}

export function applyTheme(): void {
  const html = document.documentElement;
  const mode = lockedLight ? 'light' : getThemeMode();
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
