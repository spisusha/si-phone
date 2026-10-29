import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getWheelStatus, spinWheel, DEFAULT_SECTORS, GIFT_MIN_ORDER, type WheelGift, type WheelSector } from '../api/wheelRepo';
import { hasNativeBackButton, haptic } from '../telegram/telegramWebApp';
import './WheelScreen.css';

// Колесо подарков (Роман, 29.10.2026): стекло, чехол, бесплатная доставка, −1 000 ₽ и «ещё раз».
// Приз выбирает сервер; здесь — только анимация до сектора, который он вернул.

const SPIN_MS = 4200;
const FILLS = ['wheel-fill--green', 'wheel-fill--white', 'wheel-fill--light'];
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '';
const rub = (n: number) => n.toLocaleString('ru-RU');

/** Секторы на колесе: призы по порядку, «ещё раз» — после каждых двух (6 секторов при 4 призах) */
function layout(sectors: WheelSector[]): WheelSector[] {
  const again = sectors.find((s) => s.key === 'again');
  const others = sectors.filter((s) => s.key !== 'again');
  if (!again) return others;
  const out: WheelSector[] = [];
  others.forEach((s, i) => {
    out.push(s);
    if (i % 2 === 1) out.push(again);
  });
  if (others.length % 2 === 1) out.push(again);
  return out;
}

function Wheel({ sectors, angle, spinning }: { sectors: WheelSector[]; angle: number; spinning: boolean }) {
  const n = sectors.length;
  const a = 360 / n;
  const R = 96;
  const pt = (deg: number, r: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${(r * Math.cos(rad)).toFixed(2)} ${(r * Math.sin(rad)).toFixed(2)}`;
  };
  return (
    <svg className="wheel-svg" viewBox="-100 -100 200 200" role="img" aria-label="Колесо подарков">
      <g
        className={spinning ? 'wheel-rotor is-spinning' : 'wheel-rotor'}
        style={{ transform: `rotate(${angle}deg)`, transitionDuration: spinning ? `${SPIN_MS}ms` : '0ms' }}
      >
        {sectors.map((s, i) => {
          const from = i * a;
          const to = from + a;
          const mid = from + a / 2;
          return (
            <g key={i}>
              <path className={FILLS[i % FILLS.length]} d={`M0 0 L${pt(from, R)} A${R} ${R} 0 0 1 ${pt(to, R)} Z`} />
              <text
                className="wheel-label"
                // Текст вдоль радиуса; на левой половине разворачиваем, чтобы не был вверх ногами
                transform={`rotate(${mid}) translate(0 -58) rotate(${mid > 180 ? 90 : -90})`}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {s.short}
              </text>
            </g>
          );
        })}
      </g>
      <circle className="wheel-rim" r={R} />
    </svg>
  );
}

export default function WheelScreen() {
  const navigate = useNavigate();
  const nativeBack = hasNativeBackButton();
  const [sectors, setSectors] = useState<WheelSector[]>(DEFAULT_SECTORS);
  const [gift, setGift] = useState<WheelGift | null>(null);
  const [canSpin, setCanSpin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [spinning, setSpinning] = useState(false);
  const [angle, setAngle] = useState(0);
  const [note, setNote] = useState(''); // «Ещё раз!»
  const [justWon, setJustWon] = useState(false);
  const [demo, setDemo] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const wheel = useMemo(() => layout(sectors), [sectors]);

  useEffect(() => {
    let alive = true;
    getWheelStatus().then((r) => {
      if (!alive) return;
      setLoading(false);
      if (!r.ok) { setError(r.error); return; }
      setSectors(r.sectors);
      setGift(r.gift);
      setCanSpin(r.canSpin);
      setDemo(!!r.demo);
    });
    return () => { alive = false; window.clearTimeout(timer.current); };
  }, []);

  const spin = async () => {
    if (spinning || !canSpin) return;
    setError('');
    setNote('');
    haptic('select');
    const r = await spinWheel();
    if (!r.ok) { haptic('error'); setError(r.error); return; }
    setSectors(r.sectors);
    if (r.result === 'already' || !r.prize) {
      setGift(r.gift);
      setCanSpin(false);
      return;
    }
    // Крутим до сектора с этим призом (если таких два — до любого из них)
    const list = layout(r.sectors);
    const idx = list.map((s, i) => (s.key === r.prize ? i : -1)).filter((i) => i >= 0);
    const k = idx[Math.floor(Math.random() * idx.length)] ?? 0;
    const step = 360 / list.length;
    const jitter = (Math.random() - 0.5) * step * 0.5;
    const finalMod = (360 - (k * step + step / 2) + jitter + 360) % 360;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setSpinning(true);
    setAngle((cur) => cur + (reduce ? 360 : 360 * 6) + ((finalMod - (cur % 360) + 360) % 360));
    timer.current = window.setTimeout(() => {
      setSpinning(false);
      if (r.result === 'again') {
        haptic('warning');
        setNote('Ещё раз! Крутите снова');
        setCanSpin(true);
      } else {
        haptic('success');
        setGift(r.gift);
        setCanSpin(false);
        setJustWon(true);
      }
    }, reduce ? 400 : SPIN_MS + 100);
  };

  const used = !!gift?.usedAt;

  return (
    <div className="page wheel-page">
      {!nativeBack && (
        <button className="wheel-back" onClick={() => navigate(-1)} aria-label="Назад">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
      )}
      <h1 className="wheel-title">Колесо подарков</h1>
      <p className="wheel-sub">Крутите раз в месяц — подарок добавится к следующему заказу</p>

      <div className={`wheel-box${loading ? ' is-loading' : ''}`}>
        <div className="wheel-pointer" aria-hidden="true" />
        {wheel.length > 0 && <Wheel sectors={wheel} angle={angle} spinning={spinning} />}
        <button
          className="wheel-hub"
          onClick={spin}
          disabled={!canSpin || spinning || loading}
          aria-label="Крутить колесо"
        >
          {gift && !spinning ? '✓' : 'Крутить'}
        </button>
      </div>

      {note && <p className="wheel-note" role="status">{note}</p>}
      {error && <p className="wheel-error" role="alert">{error}</p>}

      {gift && !spinning && (
        <div className="wheel-prize" role="status">
          <span className="wheel-prize__kicker">{justWon ? 'Вам выпало' : used ? 'Ваш подарок использован' : 'Ваш подарок'}</span>
          <strong className="wheel-prize__title">{gift.title}</strong>
          {gift.code && <span className="wheel-prize__code">{gift.code}</span>}
          {used ? (
            <p>Он уже добавлен к заказу. Крутить снова можно с {fmtDate(gift.nextSpinAt)}.</p>
          ) : (
            <p>
              Добавится сам к вашему следующему заказу от {rub(GIFT_MIN_ORDER)} ₽ в магазине.
              Действует до {fmtDate(gift.expiresAt)}.
            </p>
          )}
        </div>
      )}
      {gift && !spinning && !used && (
        <button className="btn btn-primary btn-block wheel-cta" onClick={() => navigate('/catalog')}>В каталог</button>
      )}

      <div className="wheel-how">
        <strong>Как это работает</strong>
        <p>
          Одна попытка в месяц на аккаунт Telegram. Подарок действует 30 дней и добавляется к заказу
          от {rub(GIFT_MIN_ORDER)} ₽, один подарок на заказ. <Link to="/wheel-rules" className="legal-link">Правила акции</Link>
        </p>
        {demo && <p className="wheel-demo">Демо для проверки на компьютере: настоящий розыгрыш — только в Telegram.</p>}
      </div>
    </div>
  );
}
