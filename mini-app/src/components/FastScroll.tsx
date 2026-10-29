import { useCallback, useEffect, useRef, useState } from 'react';
import { haptic } from '../telegram/telegramWebApp';
import './FastScroll.css';

// «Язычок» быстрой прокрутки длинной витрины (вариант Б — решение Романа 29.10.2026).
// Появляется, когда листаешь; тянешь — страница едет, рядом подсказка «где ты»: товар и «64 из 193».
// Системная полоса прокрутки в магазине скрыта (и в Telegram на iPhone её нет), поэтому свой —
// одинаково пальцем на телефоне и мышкой на компьютере (Pointer Events).

const TOP = 76; // от верха экрана до начала дорожки
const BOTTOM = 150; // снизу — нижнее меню и кнопка действия
const THUMB = 52;
const HIDE_AFTER_MS = 1500;
const MIN_SCREENS = 3; // короче трёх экранов — язычок не нужен

interface Props {
  /** Карточки, по которым считаем «где ты» */
  itemSelector: string;
  /** Подпись карточки в подсказке */
  labelOf: (el: Element) => string;
}

export default function FastScroll({ itemSelector, labelOf }: Props) {
  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [ratio, setRatio] = useState(0);
  const [hint, setHint] = useState<{ title: string; pos: string } | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);

  const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
  const trackHeight = () => window.innerHeight - TOP - BOTTOM - THUMB;

  // Какая карточка сейчас посередине экрана
  const updateHint = useCallback(() => {
    const items = document.querySelectorAll(itemSelector);
    if (!items.length) return setHint(null);
    const mid = window.innerHeight / 2;
    let best = 0;
    let bestDist = Infinity;
    items.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    setHint({ title: labelOf(items[best]), pos: `${best + 1} из ${items.length}` });
  }, [itemSelector, labelOf]);

  const showForAWhile = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    setVisible(true);
    hideTimer.current = window.setTimeout(() => setVisible(false), HIDE_AFTER_MS);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const max = maxScroll();
      if (max < window.innerHeight * (MIN_SCREENS - 1)) { setVisible(false); return; }
      setRatio(Math.min(1, Math.max(0, window.scrollY / max)));
      showForAWhile();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(hideTimer.current);
    };
  }, [showForAWhile]);

  const scrollToPointer = (clientY: number) => {
    const r = Math.min(1, Math.max(0, (clientY - TOP - THUMB / 2) / trackHeight()));
    window.scrollTo(0, r * maxScroll());
    updateHint();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    window.clearTimeout(hideTimer.current);
    setDragging(true);
    haptic('select');
    scrollToPointer(e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) scrollToPointer(e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    showForAWhile();
  };

  const top = TOP + ratio * Math.max(0, trackHeight());
  const shown = visible || dragging;

  return (
    // Для экранных чтецов не нужен: обычная прокрутка работает как всегда
    <div className={`fast-scroll${shown ? ' is-shown' : ''}`} aria-hidden="true">
      <div
        className={`fast-scroll__thumb${dragging ? ' is-dragging' : ''}`}
        style={{ top }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <i /><i /><i />
      </div>
      {dragging && hint && (
        <div className="fast-scroll__hint" style={{ top: top + 4 }}>
          {hint.title}
          <small>{hint.pos}</small>
        </div>
      )}
    </div>
  );
}
