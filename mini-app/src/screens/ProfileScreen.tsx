import { useState } from 'react';
import { getTgUser } from '../telegram/telegramWebApp';
import { getThemeMode, setThemeMode, type ThemeMode } from '../telegram/theme';
import { IconPhone, IconPin, IconTelegram } from '../components/icons';
import { openTelegramChat } from '../telegram/telegramWebApp';
import './ProfileScreen.css';

// Контакты магазина
const TG_CONTACTS = ['andr3i23', 'l_bobr_l'];
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
          {tgUser?.photo_url ? (
            <img className="profile-avatar__img" src={tgUser.photo_url} alt="" />
          ) : (
            <span className="profile-avatar__letter">
              {firstName[0].toUpperCase()}
            </span>
          )}
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
          <a key={p.tel} className="tg-row" href={`tel:${p.tel}`}>
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
        <p className="profile-theme__hint">«Авто» — как в Telegram</p>
      </div>

      <p className="profile-version">Версия 1.0.0</p>
    </div>
  );
}
