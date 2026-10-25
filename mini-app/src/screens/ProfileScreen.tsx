import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTgUser } from '../telegram/telegramWebApp';
import { getThemeMode, setThemeMode, type ThemeMode } from '../telegram/theme';
import { IconPhone, IconPin, IconTelegram } from '../components/icons';
import { callPhone, openTelegramChat } from '../telegram/telegramWebApp';
import './ProfileScreen.css';

// Контакты магазина
const TG_CONTACTS = ['l_bobr_l', 'andr3i23']; // первым — главный менеджер (Артём)
const PHONES = [
  { tel: '+79164050444', label: '+7 916 405-04-44' },
  { tel: '+79252010234', label: '+7 925 201-02-34' },
];

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
          <p className="profile-about__lead">Оригинальные гаджеты по сифанутым ценам 🤙</p>
          <p className="profile-about__note">Цены меняются ежедневно ‼️</p>
          <p>iPhone, MacBook, iPad, Watch, AirPods. Если не нашли интересующий товар — обращайтесь в личном порядке 🙌</p>
        </div>
      </div>

      <p className="tg-section-title">Связаться</p>
      <div className="tg-group profile-contacts-list">
        {TG_CONTACTS.map((c) => (
          <button key={c} className="tg-row" onClick={() => openTelegramChat(`https://t.me/${c}`)}>
            <IconTelegram size={20} className="tg-row__icon" />
            <span className="tg-row__main tg-row__title">Написать в Telegram</span>
            <span className="tg-row__value profile-contact-value">@{c}</span>
            <svg className="tg-row__chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        ))}
        {PHONES.map((p) => (
          <a key={p.tel} className="tg-row" href={`tel:${p.tel}`} onClick={(e) => { if (callPhone(p.tel)) e.preventDefault(); }}>
            <IconPhone size={20} className="tg-row__icon" />
            <span className="tg-row__main tg-row__title">Позвонить</span>
            <span className="tg-row__value profile-contact-value">{p.label}</span>
            <svg className="tg-row__chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </a>
        ))}
        <div className="tg-row">
          <IconPin size={20} className="tg-row__icon" />
          <span className="tg-row__main tg-row__title">Москва</span>
        </div>
      </div>

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
      <p className="profile-version">Версия {__APP_VERSION__}</p>
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
