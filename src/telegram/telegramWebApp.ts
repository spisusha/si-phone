import type { TgUser } from '../domain/types';

// Обёртка над Telegram.WebApp. Всё, что новее базовой версии, вызывается только
// после проверки isVersionAtLeast — у части людей старый Telegram. Вне Telegram
// (обычный браузер) функции ничего не делают, а экраны показывают свои кнопки.

interface BottomButtonParams {
  text?: string;
  color?: string;
  text_color?: string;
  is_active?: boolean;
  is_visible?: boolean;
  has_shine_effect?: boolean;
}

interface BottomButton {
  setParams: (p: BottomButtonParams) => void;
  show: () => void;
  hide: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
  showProgress: (leaveActive?: boolean) => void;
  hideProgress: () => void;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TgUser;
  };
  version?: string;
  isVersionAtLeast?: (v: string) => boolean;
  ready: () => void;
  expand: () => void;
  close: () => void;
  MainButton: BottomButton;
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'success' | 'warning' | 'error') => void;
    selectionChanged: () => void;
  };
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  disableVerticalSwipes?: () => void;
  themeParams: Record<string, string>;
  colorScheme?: 'light' | 'dark';
  onEvent?: (event: string, cb: () => void) => void;
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

// Открыто внутри Telegram и версия не ниже нужной.
function supports(version: string): boolean {
  const wa = getWebApp();
  return !!wa?.initData && !!wa.isVersionAtLeast?.(version);
}

export function initTelegram(): void {
  const wa = getWebApp();
  if (!wa) return;
  wa.ready();
  wa.expand();
  // Свайп вниз по странице больше не сворачивает магазин при прокрутке списка
  // (закрыть по-прежнему можно свайпом по шапке Telegram).
  if (supports('7.7')) wa.disableVerticalSwipes?.();
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

// Схема текущей темы Telegram; null — открыто не в Telegram.
export function getTelegramColorScheme(): 'light' | 'dark' | null {
  const wa = getWebApp();
  return wa?.initData && wa.colorScheme ? wa.colorScheme : null;
}

export function onTelegramThemeChanged(cb: () => void): void {
  getWebApp()?.onEvent?.('themeChanged', cb);
}

/* ── Цвета шапки, фона и нижней панели Telegram — в цвет приложения ── */

const HEX_RE = /^#[0-9a-f]{6}$/i;

export function setTelegramChrome(bg: string, bottomBar: string): void {
  const wa = getWebApp();
  if (!supports('6.1') || !wa) return;
  // Свой #RRGGBB шапка понимает с 6.9; раньше — только ключи темы.
  const header = supports('6.9') && HEX_RE.test(bg) ? bg : 'secondary_bg_color';
  wa.setHeaderColor?.(header);
  wa.setBackgroundColor?.(header);
  if (supports('7.10') && HEX_RE.test(bottomBar)) wa.setBottomBarColor?.(bottomBar);
}

/* ── Системная кнопка «Назад» в шапке Telegram ── */

export function hasNativeBackButton(): boolean {
  return supports('6.1') && !!getWebApp()?.BackButton;
}

export function showBackButton(onBack: () => void): () => void {
  const bb = getWebApp()?.BackButton;
  if (!hasNativeBackButton() || !bb) return () => {};
  bb.onClick(onBack);
  bb.show();
  return () => {
    bb.offClick(onBack);
    bb.hide();
  };
}

/* ── Большая нижняя кнопка Telegram (итоговое действие экрана) ── */

export function hasNativeMainButton(): boolean {
  return supports('6.0') && !!getWebApp()?.MainButton;
}

export interface MainButtonState {
  text: string;
  onClick: () => void;
  progress?: boolean;
  disabled?: boolean;
  color: string;
  textColor: string;
}

export function showMainButton(s: MainButtonState): () => void {
  const mb = getWebApp()?.MainButton;
  if (!hasNativeMainButton() || !mb) return () => {};
  mb.setParams({
    text: s.text,
    color: s.color,
    text_color: s.textColor,
    is_active: !s.disabled && !s.progress,
    is_visible: true,
  });
  if (s.progress) mb.showProgress(false);
  else mb.hideProgress();
  mb.onClick(s.onClick);
  return () => {
    mb.offClick(s.onClick);
    mb.hideProgress();
    mb.hide();
  };
}

/* ── Подтверждение закрытия (только там, где можно потерять ввод) ── */

export function setClosingConfirmation(on: boolean): void {
  const wa = getWebApp();
  if (!supports('6.2') || !wa) return;
  if (on) wa.enableClosingConfirmation?.();
  else wa.disableClosingConfirmation?.();
}

/* ── Вибрация: одна обёртка и договорённый словарь ──
   select  — выбор поменялся (цвет, память, фильтр);
   add     — товар лёг в корзину;
   success — заказ оформлен;
   warning — нажали на недоступный вариант;
   error   — ошибка при оформлении.
   На каждый тап и прокрутку не вибрируем: раздражает и садит батарею. */
export type HapticKind = 'select' | 'add' | 'success' | 'warning' | 'error';

export function haptic(kind: HapticKind): void {
  const hf = getWebApp()?.HapticFeedback;
  if (!supports('6.1') || !hf) return;
  if (kind === 'select') hf.selectionChanged();
  else if (kind === 'add') hf.impactOccurred('light');
  else hf.notificationOccurred(kind);
}
