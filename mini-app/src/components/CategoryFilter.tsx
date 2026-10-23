import type { Category } from '../domain/types';
import { ALL_CATEGORIES } from '../domain/types';
import { CategoryIcon } from './icons';
import { useChipRow } from '../hooks/useChipRow';
import './CategoryFilter.css';
import { haptic } from '../telegram/telegramWebApp';

interface Props {
  value: Category | null;
  onChange: (c: Category | null) => void;
}

export default function CategoryFilter({ value, onChange }: Props) {
  const { ref, fadeClass } = useChipRow<HTMLDivElement>();
  return (
    <div className={`cat-filter chip-row${fadeClass}`} ref={ref}>
      <button
        className={`cat-chip${value === null ? ' cat-chip--active' : ''}`}
        onClick={() => { if (value !== null) haptic('select'); onChange(null); }}
      >
        Все
      </button>
      {ALL_CATEGORIES.map((c) => (
        <button
          key={c}
          className={`cat-chip${value === c ? ' cat-chip--active' : ''}`}
          onClick={() => { if (value !== c) haptic('select'); onChange(c); }}
        >
          <CategoryIcon category={c} size={16} /> {c}
        </button>
      ))}
    </div>
  );
}
