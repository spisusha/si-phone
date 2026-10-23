import { useEffect, useRef, useState } from 'react';

/**
 * Строка чипсов, которая листается вбок.
 * - Сообщает, есть ли ещё чипсы слева/справа — CSS показывает мягкое затухание у края,
 *   чтобы было видно «дальше есть ещё».
 * - Колёсико мыши листает строку вбок (Telegram на компьютере, браузер): пальцем там не проведёшь.
 */
export function useChipRow<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 });
    };

    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      // Вертикальное колёсико превращаем в горизонтальную прокрутку строки
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        const max = el.scrollWidth - el.clientWidth;
        const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
        const atEnd = el.scrollLeft >= max && e.deltaY > 0;
        if (atStart || atEnd) return; // на краю — пусть листается страница
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      el.removeEventListener('wheel', onWheel);
      ro.disconnect();
    };
  }, []);

  const fadeClass = `${edges.left ? ' chip-row--fade-left' : ''}${edges.right ? ' chip-row--fade-right' : ''}`;
  return { ref, fadeClass };
}
