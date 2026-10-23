import { useEffect, useRef } from 'react';
import { hasNativeMainButton, showMainButton } from './telegramWebApp';

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

interface MainButtonOptions {
  text: string;
  onClick: () => void;
  visible?: boolean;
  progress?: boolean;
  disabled?: boolean;
}

// Системная кнопка Telegram встаёт ПОД нашим нижним меню — Роману это показалось странным
// (23.10.2026, проверка на iPhone). Поэтому итоговое действие — своя полоса над меню
// (.action-bar) и в Telegram тоже. Чтобы вернуть кнопку Telegram — поставить true.
const USE_NATIVE_MAIN_BUTTON = false;

/**
 * Большая нижняя кнопка Telegram для итогового действия экрана.
 * Возвращает true, если кнопка Telegram показана — тогда своя кнопка на странице не нужна.
 * Вне Telegram (или в старой версии) возвращает false, и экран показывает свою кнопку.
 */
export function useTelegramMainButton({ text, onClick, visible = true, progress, disabled }: MainButtonOptions): boolean {
  const native = USE_NATIVE_MAIN_BUTTON && hasNativeMainButton();
  const clickRef = useRef(onClick);
  useEffect(() => { clickRef.current = onClick; });

  useEffect(() => {
    if (!native || !visible) return;
    return showMainButton({
      text,
      onClick: () => clickRef.current(),
      progress,
      disabled,
      color: cssVar('--color-primary') || '#7ED957',
      textColor: cssVar('--color-on-primary') || '#102A07',
    });
  }, [native, visible, text, progress, disabled]);

  return native && visible;
}
