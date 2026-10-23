import { useState } from 'react';
import { getTgUser } from '../telegram/telegramWebApp';
import { getThemeMode, setThemeMode, type ThemeMode } from '../telegram/theme';
import { IconPhone, IconPin, IconTelegram } from '../components/icons';
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
  const tgId = tgUser?.id;

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
          {tgId && (
            <p className="profile-id">ID: {tgId}</p>
          )}
        </div>
      </div>

      <div className="profile-section">
        <h3>О магазине</h3>
        <div className="profile-about">
          <p className="profile-about__lead">Оригинальные гаджеты по сифанутым ценам 🤙</p>
          <p className="profile-about__note">Цены меняются ежедневно ‼️</p>
          <p>iPhone, MacBook, iPad, Watch, AirPods. Если не нашли интересующий товар — обращайтесь в личном порядке 🙌</p>
        </div>
      </div>

      <div className="profile-section">
        <h3>Контакты</h3>
        <div className="profile-contacts">
          <div className="profile-contact-row">
            <IconPhone size={20} className="profile-contact-icon" />
            <span>
              <a href="tel:+79164050444" className="profile-contact-link">+7 916 405-04-44</a>
              {' и '}
              <a href="tel:+79252010234" className="profile-contact-link">+7 925 201-02-34</a>
            </span>
          </div>
          <div className="profile-contact-row">
            <IconTelegram size={20} className="profile-contact-icon" />
            <span>
              <a href="https://t.me/andr3i23" target="_blank" rel="noopener noreferrer" className="profile-contact-link">@andr3i23</a>
              {' и '}
              <a href="https://t.me/l_bobr_l" target="_blank" rel="noopener noreferrer" className="profile-contact-link">@l_bobr_l</a>
            </span>
          </div>
          <div className="profile-contact-row">
            <IconPin size={20} className="profile-contact-icon" />
            <span>город Москва</span>
          </div>
        </div>
      </div>

      <div className="profile-section">
        <h3>Оформление</h3>
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
