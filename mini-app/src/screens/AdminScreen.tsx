import { useState, useEffect } from 'react';
import { lockLightTheme } from '../telegram/theme';
import './AdminScreen.css';

// Админка. Старые вкладки «Цены» (загрузка XLSX) и «Медиа» убраны 24.10.2026 вместе со старым каталогом.
// Новая админка (поиск товара, цена в строке, наценки, фото) — этап B3. Пока здесь только вход.

const BASE = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const LS_TOKEN = 'admin_token';
const LS_EXPIRES = 'admin_expires';
// Метка «доверенного устройства» (90 дней): снимает общий потолок ошибок входа для владельца.
const LS_DEVICE = 'admin_device';

function getAuth(): { token: string; expiresAt: string } | null {
  const token = localStorage.getItem(LS_TOKEN);
  const expiresAt = localStorage.getItem(LS_EXPIRES);
  if (!token || !expiresAt) return null;
  if (new Date(expiresAt) < new Date()) {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_EXPIRES);
    return null;
  }
  return { token, expiresAt };
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/functions/v1/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON },
        body: JSON.stringify({ password, deviceToken: localStorage.getItem(LS_DEVICE) ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось войти');
      localStorage.setItem(LS_TOKEN, data.token);
      localStorage.setItem(LS_EXPIRES, data.expiresAt);
      if (data.deviceToken) localStorage.setItem(LS_DEVICE, data.deviceToken);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page admin-page admin-login">
      <h1 className="page-title">Админка</h1>
      <form className="admin-login__form" onSubmit={handleSubmit}>
        <input
          className="admin-input"
          type="password"
          placeholder="Пароль"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        <button className="btn btn-primary btn-block" disabled={loading || !password}>
          {loading ? 'Вход…' : 'Войти'}
        </button>
        {error && <p className="admin-error">{error}</p>}
      </form>
    </div>
  );
}

export default function AdminScreen() {
  // Админка свёрстана под светлую схему — держим её светлой и в тёмном Telegram.
  useEffect(() => lockLightTheme(), []);
  const [authed, setAuthed] = useState(() => !!getAuth());

  const handleLogout = () => {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_EXPIRES);
    setAuthed(false);
  };

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  return (
    <div className="page admin-page">
      <div className="admin-topbar">
        <h1 className="page-title">Админка</h1>
        <button className="btn btn-outline admin-topbar__logout" onClick={handleLogout}>Выйти</button>
      </div>
      <div className="admin-soon">
        <h2>Скоро — новая админка</h2>
        <p>
          Цены и фото будут здесь: поиск товара, цена прямо в строке, наценки и курс, загрузка фото.
          Каталог уже работает на новой базе, цены пересчитываются по курсу ЦБ сами.
        </p>
      </div>
    </div>
  );
}
