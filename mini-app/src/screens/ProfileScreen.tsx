import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SELLER_LINE } from '../domain/legal';
import { getTgUser } from '../telegram/telegramWebApp';
import { getThemeMode, setThemeMode, type ThemeMode } from '../telegram/theme';
import { IconChat, IconClock, IconPhone, IconPin, IconStar, IconTelegram } from '../components/icons';
import { callPhone, openMaxChat, openTelegramChat } from '../telegram/telegramWebApp';
import { CONTACTS, WORK_HOURS, type ShopContact } from '../domain/shop';
import { reviewPhotoUrl, useReviews } from '../api/reviewsRepo';
import './ProfileScreen.css';

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'auto', label: 'Авто' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
];

export default function ProfileScreen() {
  const tgUser = getTgUser();
  const [theme, setTheme] = useState(getThemeMode);

  const chooseTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    setTheme(mode);
  };

  const firstName = tgUser?.first_name || 'Пользователь';
  const lastName = tgUser?.last_name || '';
  const username = tgUser?.username;

  return (
    <div className="page profile-page">
      <h1 className="page-title">Профиль</h1>

      <div className="profile-card">
        <div className="profile-avatar">
          <TgAvatar url={tgUser?.photo_url} letter={firstName[0].toUpperCase()} />
        </div>
        <div className="profile-info">
          <h2 className="profile-name">
            {firstName} {lastName}
          </h2>
          {username && (
            <p className="profile-username">@{username}</p>
          )}
        </div>
      </div>

      <p className="tg-section-title">О магазине</p>
      <div className="profile-section">
        <div className="profile-about">
          <p className="profile-about__lead">Оригинальные гаджеты по выгодным ценам 🤙</p>
          <p className="profile-about__note">Цены меняются ежедневно ‼️</p>
          <p>iPhone, MacBook, iPad, Watch, AirPods. Если не нашли интересующий товар — обращайтесь в личном порядке 🙌</p>
          <p>Техника новая, оригинальная. Гарантию и её условия уточняйте у менеджера.</p>
        </div>
        <ReviewsRow />
      </div>

      <p className="tg-section-title">Контакты</p>
      {/* По карточке на человека; звёздочка — к кому писать в первую очередь */}
      {CONTACTS.map((c) => <ContactCard key={c.telegram} contact={c} />)}
      <p className="profile-city profile-city--hours"><IconClock size={16} /> Заказы подтверждаем ежедневно {WORK_HOURS.label}. Оформить можно в любое время.</p>
      <p className="profile-city"><IconPin size={16} /> Москва</p>

      <p className="tg-section-title">Оформление</p>
      <div className="profile-section">
        <div className="profile-theme" role="radiogroup" aria-label="Тема оформления">
          {THEME_OPTIONS.map((o) => (
            <button
              key={o.value}
              role="radio"
              aria-checked={theme === o.value}
              className={`profile-theme__option${theme === o.value ? ' is-active' : ''}`}
              onClick={() => chooseTheme(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tg-group profile-legal">
        <Link to="/privacy" className="tg-row">
          <span className="tg-row__main tg-row__title">Политика обработки персональных данных</span>
          <svg className="tg-row__chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        </Link>
      </div>
      <p className="profile-seller">{SELLER_LINE}</p>
      <p className="profile-version">Версия {__APP_VERSION__}</p>
    </div>
  );
}

// «Отзывы покупателей ›» под «О магазине» (без числа — Роман, 29.10.2026) → экран отзывов. Нет отзывов или не загрузились — строки нет.
function ReviewsRow() {
  const data = useReviews();
  if (!data || data.reviews.length === 0) return null;
  const withPhotos = data.reviews.filter((r) => r.photos > 0).slice(0, 3);
  return (
    <Link to="/reviews" className="reviews-row">
      {withPhotos.length > 0 && (
        <span className="reviews-row__pics" aria-hidden="true">
          {withPhotos.map((r) => <img key={r.id} src={reviewPhotoUrl(r.id, 0)} alt="" />)}
        </span>
      )}
      <span className="reviews-row__text">
        <b>Отзывы покупателей</b>
        <span>из нашего канала в Telegram</span>
      </span>
      <svg className="reviews-row__chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
    </Link>
  );
}

function ContactCard({ contact: c }: { contact: ShopContact }) {
  const buttons = 2 + (c.max ? 1 : 0);
  return (
    <div className={`contact-card${c.primary ? ' contact-card--primary' : ''}`}>
      <div className="contact-card__who">
        <span className="contact-card__avatar" aria-hidden="true">{c.name[0]}</span>
        <span className="contact-card__name">
          {c.name}
          {c.primary && <IconStar size={16} className="contact-card__star" />}
          {c.primary && <span className="sr-only"> — пишите в первую очередь</span>}
        </span>
      </div>
      <div className="contact-card__actions" style={{ gridTemplateColumns: `repeat(${buttons}, 1fr)` }}>
        <button className="contact-card__btn" onClick={() => openTelegramChat(`https://t.me/${c.telegram}`)}>
          <IconTelegram size={20} />
          Telegram
        </button>
        {c.max && (
          <button className="contact-card__btn" onClick={() => openMaxChat(c.max!)}>
            <IconChat size={20} />
            MAX
          </button>
        )}
        <a
          className="contact-card__btn"
          href={`tel:${c.phone.tel}`}
          aria-label={`Позвонить ${c.name}: ${c.phone.label}`}
          onClick={(e) => { if (callPhone(c.phone.tel)) e.preventDefault(); }}
        >
          <IconPhone size={20} />
          Позвонить
        </a>
      </div>
    </div>
  );
}

/**
 * Фото профиля из Telegram. Грузим только после полной загрузки страницы и ждём не дольше 5 с:
 * если сервер Telegram не отдаёт фото (настройки приватности, сеть), картинка не висит
 * «вечной загрузкой» (на iPhone застывала полоска загрузки) — показываем первую букву имени.
 */
function TgAvatar({ url, letter }: { url?: string; letter: string }) {
  const [loaded, setLoaded] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    const timer = window.setTimeout(() => { img.src = ''; }, 5000);
    img.onload = () => { window.clearTimeout(timer); if (alive && img.naturalWidth > 0) setLoaded(url); };
    img.onerror = () => window.clearTimeout(timer);
    const start = () => { img.src = url; };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener('load', start);
    };
  }, [url]);

  return loaded
    ? <img className="profile-avatar__img" src={loaded} alt="" referrerPolicy="no-referrer" />
    : <span className="profile-avatar__letter">{letter}</span>;
}
