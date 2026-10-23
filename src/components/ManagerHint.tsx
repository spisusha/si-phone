import { IconBox } from './icons';
import { openTelegramChat } from '../telegram/telegramWebApp';
import { MANAGER_URL } from '../domain/shop';
import './ManagerHint.css';

interface Props {
  title?: string;
  text?: string;
}

// Тихая подсказка «нет на витрине — напишите менеджеру».
// Стоит там, где человек ищет и не находит: каталог, пустые экраны, конец витрины.
export default function ManagerHint({
  title = 'Не нашли свою модель?',
  text = 'Возможно, она уже на складе, но ещё не на витрине. Менеджер проверит наличие и забронирует.',
}: Props) {
  return (
    <section className="manager-hint">
      <IconBox size={22} className="manager-hint__icon" />
      <div>
        <p className="manager-hint__title">{title}</p>
        <p className="manager-hint__text">{text}</p>
        <button className="manager-hint__link" onClick={() => openTelegramChat(MANAGER_URL)}>
          Написать менеджеру
        </button>
      </div>
    </section>
  );
}
