import { useState, useEffect, useCallback, Suspense } from 'react';
import { lockLightTheme } from '../telegram/theme';
import { getInitData } from '../telegram/telegramWebApp';
import { adminCall, type AdminAuth } from '../admin/api';
import AdminApp from '../admin/AdminApp';
import './AdminScreen.css';

// Админка (этап B3): вход здесь, сами экраны — в src/admin/.

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

  // В Telegram — вход по аккаунту (сервер проверяет подпись и ID в списке админов), без пароля.
  // В браузере или если аккаунта нет в списке — вход по паролю.
  const [auth, setAuth] = useState<AdminAuth | null>(() => {
    const a = getAuth();
    return a ? { kind: 'password', token: a.token } : null;
  });
  const [checkingTg, setCheckingTg] = useState(() => !getAuth() && !!getInitData());
  const [tgDenied, setTgDenied] = useState(false);

  useEffect(() => {
    if (!checkingTg) return;
    const tg: AdminAuth = { kind: 'tg', initData: getInitData() };
    adminCall<{ who: string }>(tg, 'whoami')
      .then(() => setAuth(tg))
      .catch(() => setTgDenied(true))
      .finally(() => setCheckingTg(false));
  }, [checkingTg]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_EXPIRES);
    setAuth(null);
  }, []);

  if (checkingTg) return <div className="page admin-page admin-login"><p>Проверяю доступ…</p></div>;
  if (!auth) {
    return (
      <>
        {tgDenied && <p className="admin-error" style={{ margin: '16px' }}>Вашего Telegram нет в списке админов — войдите по паролю</p>}
        <LoginScreen onLogin={() => { const a = getAuth(); if (a) setAuth({ kind: 'password', token: a.token }); }} />
      </>
    );
  }

  return (
    <Suspense fallback={<div className="page admin-page"><p>Загружаю…</p></div>}>
      <AdminApp auth={auth} logout={auth.kind === 'password' ? handleLogout : null} onDenied={handleLogout} />
    </Suspense>
  );
}
