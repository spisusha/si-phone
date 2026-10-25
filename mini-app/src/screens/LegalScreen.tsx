import { Link, useNavigate } from 'react-router-dom';
import { hasNativeBackButton } from '../telegram/telegramWebApp';
import { CONSENT, PRIVACY_POLICY, type LegalDoc } from '../domain/legal';
import './LegalScreen.css';

// Политика обработки персональных данных (/privacy) и согласие (/consent) — 152-ФЗ.
// Обычные страницы магазина: открываются из оформления, профиля и по прямой ссылке.

export default function LegalScreen({ doc }: { doc: 'privacy' | 'consent' }) {
  const navigate = useNavigate();
  const nativeBack = hasNativeBackButton();
  const d: LegalDoc = doc === 'privacy' ? PRIVACY_POLICY : CONSENT;

  return (
    <div className="page legal">
      {!nativeBack && (
        <button className="legal__back" onClick={() => navigate(-1)} aria-label="Назад">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
      )}
      <h1 className="legal__title">{d.title}</h1>
      <p className="legal__intro">{d.intro}</p>
      {d.sections.map((s) => (
        <section key={s.title} className="legal__section">
          <h2>{s.title}</h2>
          {s.body.map((b, i) => (typeof b === 'string'
            ? <p key={i}>{b}</p>
            : <ul key={i}>{b.list.map((li) => <li key={li}>{li}</li>)}</ul>))}
        </section>
      ))}
      <p className="legal__other">
        {doc === 'privacy'
          ? <Link to="/consent" replace>Согласие на обработку персональных данных</Link>
          : <Link to="/privacy" replace>Политика обработки персональных данных</Link>}
      </p>
    </div>
  );
}
