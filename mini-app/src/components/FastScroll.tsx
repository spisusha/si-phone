import { useCallback, useEffect, useRef, useState } from 'react';
import { haptic } from '../telegram/telegramWebApp';
import './FastScroll.css';

// «Язычок» быстрой прокрутки длинной витрины (вариант Б — решение Романа 29.10.2026).
// Появляется, когда листаешь; тянешь — страница едет, рядом подсказка «где ты» — короткая группа
// («iPhone 17», «MacBook M4»), без счётчиков (Роман, 29.10.2026).
// Системная полоса прокрутки в магазине скрыта (и в Telegram на iPhone её нет), поэтому свой —
// одинаково пальцем на телефоне и мышкой на компьютере (Pointer Events).
//
// Скорость (Роман: «слишком быстро всё проскальзывает») — два варианта на выбор, переключатель ?fs=a / ?fs=b:
//   A — «плавно»: язычок под пальцем, страница мягко догоняет его, без рывков;
//   Б — «медленнее»: палец двигает страницу втрое медленнее, чем раньше; чтобы долистать до конца — тянуть ещё раз.

const TOP = 76; // от верха экрана до начала дорожки
const BOTTOM = 150; // снизу — нижнее меню и кнопка действия
const THUMB = 52;
const HIDE_AFTER_MS = 1500;
const MIN_SCREENS = 3; // короче трёх экранов — язычок не нужен
const EASE = 0.18; // доля пути, которую страница проходит за кадр, догоняя цель
const SLOW = 3; // во сколько раз медленнее прежнего в варианте Б

type Mode = 'a' | 'b';
function readMode(): Mode {
  try {
    const q = new URLSearchParams(window.location.search).get('fs');
    if (q === 'a' || q === 'b') sessionStorage.setItem('fs-mode', q);
    return sessionStorage.getItem('fs-mode') === 'a' ? 'a' : 'b'; // по умолчанию — «медленнее»
  } catch {
    return 'b';
  }
}

interface Props {
  /** Карточки, по которым считаем «где ты» */
  itemSelector: string;
  /** Подпись карточки в подсказке */
  labelOf: (el: Element) => string;
}

export default function FastScroll({ itemSelector, labelOf }: Props) {
  const [mode] = useState(readMode);
  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [ratio, setRatio] = useState(0);
  const [thumbY, setThumbY] = useState<number | null>(null); // в варианте А язычок идёт за пальцем
  const [hint, setHint] = useState('');
  const hideTimer = useRef<number | undefined>(undefined);
  const target = useRef(0);
  const raf = useRef<number | undefined>(undefined);
  const drag = useRef({ startY: 0, startScroll: 0 });

  const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
  const trackHeight = () => Math.max(1, window.innerHeight - TOP - BOTTOM - THUMB);

  // Какая карточка сейчас посередине экрана
  const updateHint = useCallback(() => {
    const items = document.querySelectorAll(itemSelector);
    if (!items.length) return setHint('');
    const mid = window.innerHeight / 2;
    let best = 0;
    let bestDist = Infinity;
    items.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    setHint(labelOf(items[best]));
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
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [showForAWhile]);

  // Страница мягко догоняет цель — без рывков (при «меньше движения» — сразу)
  const glide = useCallback(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const step = () => {
      const cur = window.scrollY;
      const diff = target.current - cur;
      if (reduce || Math.abs(diff) < 1) {
        window.scrollTo(0, target.current);
        updateHint();
        raf.current = undefined;
        return;
      }
      window.scrollTo(0, cur + diff * EASE);
      updateHint();
      raf.current = requestAnimationFrame(step);
    };
    if (!raf.current) raf.current = requestAnimationFrame(step);
  }, [updateHint]);

  const moveTo = (clientY: number) => {
    const max = maxScroll();
    if (mode === 'a') {
      const r = Math.min(1, Math.max(0, (clientY - TOP - THUMB / 2) / trackHeight()));
      setThumbY(TOP + r * trackHeight());
      target.current = r * max;
    } else {
      const gain = max / trackHeight() / SLOW;
      target.current = Math.min(max, Math.max(0, drag.current.startScroll + (clientY - drag.current.startY) * gain));
    }
    glide();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    window.clearTimeout(hideTimer.current);
    setDragging(true);
    haptic('select');
    drag.current = { startY: e.clientY, startScroll: window.scrollY };
    target.current = window.scrollY;
    updateHint();
    if (mode === 'a') moveTo(e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) moveTo(e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    setThumbY(null);
    showForAWhile();
  };

  const top = dragging && thumbY !== null ? thumbY : TOP + ratio * trackHeight();
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
        <div className="fast-scroll__hint" style={{ top: top + 6 }}>
          {hint}
        </div>
      )}
    </div>
  );
}
