import { useState } from 'react';
import './OptionSelector.css';
import { haptic } from '../telegram/telegramWebApp';

interface Props {
  label: string;
  options: string[];
  value: string | undefined;
  onChange: (val: string) => void;
  disabledOptions?: string[];
  format?: (val: string) => string;
}

export default function OptionSelector({ label, options, value, onChange, disabledOptions = [], format = (v) => v }: Props) {
  const [showToast, setShowToast] = useState(false);

  // Один вариант — выбирать нечего, группа только мешает (значение и так видно в названии)
  if (options.length <= 1) return null;

  const handleClick = (opt: string) => {
    if (disabledOptions.includes(opt)) {
      haptic('warning');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 1500);
      return;
    }
    if (opt !== value) haptic('select');
    onChange(opt);
  };

  return (
    <div className="option-selector">
      <span className="option-selector__label">{label}</span>
      <div className="option-selector__chips">
        {options.map((opt) => {
          const isDisabled = disabledOptions.includes(opt);
          return (
            <button
              key={opt}
              className={`chip${value === opt ? ' chip--active' : ''}${isDisabled ? ' chip--disabled' : ''}`}
              onClick={() => handleClick(opt)}
            >
              {format(opt)}
            </button>
          );
        })}
      </div>
      {showToast && <div className="option-toast">Нет в наличии</div>}
    </div>
  );
}
