import type { SortOption } from '../domain/types';
import { useChipRow } from '../hooks/useChipRow';
import './SortBar.css';
import { haptic } from '../telegram/telegramWebApp';

const OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'popularity', label: 'Популярные' },
  { value: 'price_asc', label: 'Дешевле' },
  { value: 'price_desc', label: 'Дороже' },
  { value: 'newest', label: 'Новинки' },
];

interface Props {
  value: SortOption;
  onChange: (v: SortOption) => void;
}

export default function SortBar({ value, onChange }: Props) {
  const { ref, fadeClass } = useChipRow<HTMLDivElement>();
  return (
    <div className={`sort-bar chip-row${fadeClass}`} ref={ref}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          className={`sort-chip${value === o.value ? ' sort-chip--active' : ''}`}
          onClick={() => { if (value !== o.value) haptic('select'); onChange(o.value); }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
