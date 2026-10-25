import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

// Общие кусочки админки: шапка со стрелкой «назад» (в админке системная «Назад» Telegram выключена) и плашка-строка.

export function AdmHeader({ title, back, right }: { title: string; back?: string; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="catalog-header">
      {back && (
        <button className="catalog-back" onClick={() => navigate(back)} aria-label="Назад">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
      )}
      <h1 className="page-title" style={{ marginBottom: 0, flex: 1 }}>{title}</h1>
      {right}
    </div>
  );
}

const Chevron = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
);

/** Плоская плашка, как в каталоге магазина: картинка или значок, заголовок, подпись */
export function AdmRow({ title, sub, image, icon, onClick }: {
  title: string; sub?: ReactNode; image?: string | null; icon?: ReactNode; onClick: () => void;
}) {
  return (
    <button className="catalog-model-btn" onClick={onClick}>
      {icon ? <span className="adm-icon">{icon}</span> : (
        <span className="catalog-model-thumb"><img src={image || '/placeholder.svg'} alt="" loading="lazy" /></span>
      )}
      <div className="catalog-model-info">
        <span className="catalog-model-title">{title}</span>
        {sub && <span className="catalog-model-sub">{sub}</span>}
      </div>
      <Chevron />
    </button>
  );
}

const svg = (d: ReactNode) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
export const IconBox = () => svg(<><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></>);
export const IconUpload = () => svg(<><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></>);
export const IconPercent = () => svg(<><path d="M19 5L5 19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>);
export const IconClock = () => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
