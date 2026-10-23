import type { TgUser } from '../domain/types';

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TgUser;
  };
  ready: () => void;
  expand: () => void;
  close: () => void;
  MainButton: {
    setText: (t: string) => void;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
  };
  themeParams: Record<string, string>;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

function getWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function initTelegram(): void {
  const wa = getWebApp();
  if (wa) {
    wa.ready();
    wa.expand();
  }
}

export function getTgUser(): TgUser | null {
  return getWebApp()?.initDataUnsafe?.user ?? null;
}

// Сырая подписанная строка Telegram — сервер проверяет её подпись.
// initDataUnsafe годится только для показа имени на экране.
export function getInitData(): string {
  return getWebApp()?.initData ?? '';
}

export function isTelegramEnv(): boolean {
  return !!getWebApp()?.initData;
}
