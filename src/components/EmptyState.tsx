import { useNavigate } from 'react-router-dom';
import { useCatalogStore } from '../store/catalogStore';
import { MANAGER_URL } from '../domain/shop';
import { openTelegramChat } from '../telegram/telegramWebApp';
import './EmptyState.css';

// Пустые экраны и экраны ошибок — одним компонентом, чтобы везде был один характер:
// линейная сценка в стиле иконок магазина (выбор Романа, этап 5.2).
export type EmptyKind = 'cart' | 'notFound' | 'offline' | 'crash';

interface Copy { title: string; text: string }

const COPY: Record<EmptyKind, Copy> = {
  cart: { title: 'Корзина пока пустая', text: 'Загляните в каталог — там вся техника в наличии.' },
  notFound: { title: 'Такого товара уже нет', text: 'Возможно, его разобрали или ссылка устарела. Посмотрите каталог или спросите менеджера.' },
  offline: { title: 'Не удалось загрузить каталог', text: 'Похоже, пропал интернет. Проверьте связь и попробуйте ещё раз.' },
  crash: { title: 'Что-то пошло не так', text: 'Попробуйте открыть магазин заново. Если не поможет — напишите менеджеру.' },
};

interface Props {
  kind: EmptyKind;
  /** Главное действие: «В каталог», «Попробовать ещё раз»… */
  action?: { label: string; onClick: () => void };
  /** Показать ссылку «Написать менеджеру» под кнопкой */
  manager?: boolean;
}

export default function EmptyState({ kind, action, manager }: Props) {
  const copy = COPY[kind];
  return (
    <div className="page empty">
      <EmptyScene kind={kind} />
      <h2 className="empty__title">{copy.title}</h2>
      <p className="empty__text">{copy.text}</p>
      {action && (
        <button className="btn btn-primary empty__action" onClick={action.onClick}>{action.label}</button>
      )}
      {manager && (
        <button className="empty__manager" onClick={() => openTelegramChat(MANAGER_URL)}>
          Написать менеджеру
        </button>
      )}
    </div>
  );
}

/** Каталог не загрузился — честно говорим и даём повторить. */
export function CatalogFailed() {
  const retry = useCatalogStore((s) => s.retry);
  return <EmptyState kind="offline" action={{ label: 'Попробовать ещё раз', onClick: () => { void retry(); } }} manager />;
}

/** Товара, модели или раздела нет (ссылка устарела, товар убрали с витрины). */
export function NotFound() {
  const navigate = useNavigate();
  return (
    <EmptyState
      kind="notFound"
      action={{ label: 'Перейти в каталог', onClick: () => navigate('/catalog') }}
      manager
    />
  );
}

/* ── Линейные сценки в стиле иконок магазина ──
   Серый контур + одна зелёная деталь; короткое движение один раз при появлении. */

function EmptyScene({ kind }: { kind: EmptyKind }) {
  return (
    <svg className="empty__scene" viewBox="0 0 160 120" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="80" cy="106" rx="52" ry="6" className="scene-shadow" />
      {kind === 'cart' && (
        <>
          {/* телефон опускается в корзину */}
          <g className="scene-drop">
            <rect x="70" y="10" width="22" height="40" rx="5" className="scene-accent" transform="rotate(-14 81 30)" />
            <path d="M78 15h6" className="scene-accent" transform="rotate(-14 81 30)" />
          </g>
          <path d="M28 40h14l10 46a5 5 0 0 0 5 4h52a5 5 0 0 0 5-4l9-34H46" className="scene-line" />
          <path d="M58 62h56M60 74h50" className="scene-line scene-thin" />
          <circle cx="62" cy="100" r="4" className="scene-line" />
          <circle cx="106" cy="100" r="4" className="scene-line" />
        </>
      )}
      {kind === 'notFound' && (
        <>
          <rect x="52" y="14" width="44" height="82" rx="9" className="scene-line" />
          <path d="M68 22h12" className="scene-line" />
          <path d="M66 50h16M66 60h10" className="scene-line scene-thin" />
          {/* лупа ищет и не находит */}
          <g className="scene-search">
            <circle cx="104" cy="66" r="15" className="scene-accent" />
            <path d="M115 77l12 12" className="scene-accent" />
          </g>
        </>
      )}
      {kind === 'offline' && (
        <>
          <rect x="58" y="14" width="44" height="82" rx="9" className="scene-line" />
          <path d="M74 22h12" className="scene-line" />
          {/* полоски связи: первая есть, остальные пропали */}
          <path d="M68 76v8" className="scene-accent" />
          <path d="M76 70v14M84 62v22M92 54v30" className="scene-line scene-dash" />
          <path d="M112 30l14 14M126 30l-14 14" className="scene-accent scene-blink" />
        </>
      )}
      {kind === 'crash' && (
        <>
          <rect x="58" y="14" width="44" height="82" rx="9" className="scene-line" />
          <path d="M74 22h12" className="scene-line" />
          {/* стрелка «заново» на экране */}
          <g className="scene-spin">
            <path d="M90 56a10 10 0 1 1-4-8" className="scene-accent" />
            <path d="M87 42l0 7 7 0" className="scene-accent" />
          </g>
        </>
      )}
    </svg>
  );
}
