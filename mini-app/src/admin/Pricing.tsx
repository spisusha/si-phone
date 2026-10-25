import { useEffect, useState } from 'react';
import { useAdmin, useDerived } from './context';
import { AdmHeader } from './ui';
import { fmtDate, rub, round500, type HistoryData } from './api';

// «Наценки и курс»: курс ЦБ и курс магазина, надбавка к курсу, наценка по категориям.
// После сохранения цены всех товаров пересчитываются сразу.

const CATS = ['iPhone', 'iPad', 'MacBook', 'Watch', 'AirPods'] as const;
const num = (s: string) => Number(s.replace(',', '.'));

export function PricingScreen() {
  const { data, call, reload } = useAdmin();
  const { markup, fxMargin, usd, shopRate } = useDerived();
  const [margin, setMargin] = useState(String(fxMargin));
  const [pcts, setPcts] = useState<Record<string, string>>(() => Object.fromEntries(CATS.map((c) => [c, String(markup[c] ?? 0)])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const newRate = usd != null ? usd * (1 + num(margin) / 100) : null;
  const changed = num(margin) !== fxMargin || CATS.some((c) => num(pcts[c]) !== (markup[c] ?? 0));
  const valid = num(margin) >= 0 && num(margin) <= 20 && CATS.every((c) => num(pcts[c]) >= 0 && num(pcts[c]) <= 50);

  const save = async () => {
    if (!valid) { setMsg({ ok: false, text: 'Надбавка — от 0 до 20 %, наценка — от 0 до 50 %' }); return; }
    if (!window.confirm('Цены всех товаров пересчитаются сразу. Сохранить?')) return;
    setBusy(true); setMsg(null);
    try {
      await call('save-pricing', { fxMargin: num(margin), markups: Object.fromEntries(CATS.map((c) => [c, num(pcts[c])])) });
      await reload();
      setMsg({ ok: true, text: 'Сохранено, цены пересчитаны' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Не получилось' });
    } finally { setBusy(false); }
  };

  const refresh = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await call<{ usd: number }>('refresh-fx');
      await reload();
      setMsg({ ok: true, text: `Курс ЦБ обновлён: ${Number(r.usd).toFixed(2)} ₽` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Не получилось' });
    } finally { setBusy(false); }
  };

  const last = data.fx[0];
  return (
    <div className="page adm">
      <AdmHeader title="Наценки и курс" back="/admin" />
      {msg && <div className={msg.ok ? 'adm-ok' : 'adm-err'}>{msg.text}</div>}

      <div className="adm-card">
        <h2>Курс доллара</h2>
        <div className="adm-big">{shopRate ? `${shopRate.toFixed(2)} ₽` : '—'}</div>
        <p>курс магазина = ЦБ {usd?.toFixed(2) ?? '—'} ₽ + {fxMargin} %</p>
        <div className="adm-rates">
          Курс ЦБ на {last ? new Date(last.rate_date).toLocaleDateString('ru-RU') : '—'}, получен {fmtDate(last?.fetched_at)}{last?.source ? `, ${last.source}` : ''}.
          Обновляется сам в 9:00 и 16:00 по Москве; в выходные ЦБ курс не меняет.
          {data.fx.length > 1 && <><br />Раньше: {data.fx.slice(1, 6).map((f) => `${new Date(f.rate_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} ${Number(f.usd_cbr).toFixed(2)}`).join(', ')}</>}
        </div>
        <div className="adm-actions"><button className="btn btn-ghost" disabled={busy} onClick={refresh}>Обновить курс сейчас</button></div>
      </div>

      <div className="adm-section">Надбавка к курсу ЦБ</div>
      <div className="adm-field">
        <div className="adm-pct"><input className="adm-input" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} /><span>%</span></div>
        <div className="adm-hint">Банки и обменники продают доллар дороже ЦБ. С этой надбавкой курс магазина будет <b>{newRate ? `${newRate.toFixed(2)} ₽` : '—'}</b></div>
      </div>

      <div className="adm-section">Наценка на закупку</div>
      {CATS.map((c) => (
        <div className="adm-field" key={c}>
          <label className="adm-label">{c}</label>
          <div className="adm-pct"><input className="adm-input" inputMode="decimal" value={pcts[c]} onChange={(e) => setPcts((s) => ({ ...s, [c]: e.target.value }))} /><span>%</span></div>
          <div className="adm-hint">Закупка 100 000 ₽ → в магазине <b>{rub(round500(100000 * (1 + num(pcts[c] || '0') / 100)))}</b></div>
        </div>
      ))}

      <div className="adm-actions">
        <button className="btn btn-primary" disabled={busy || !changed} onClick={save}>{busy ? 'Сохраняю…' : 'Сохранить и пересчитать цены'}</button>
      </div>
    </div>
  );
}

export function HistoryScreen() {
  const { call } = useAdmin();
  const [h, setH] = useState<HistoryData | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    call<HistoryData>('history').then(setH).catch((e) => setErr(e instanceof Error ? e.message : 'Не получилось'));
  }, [call]);

  const describe = (c: HistoryData['changes'][number]) => {
    const parts: string[] = [];
    if (c.new_purchase != null && c.new_purchase !== c.old_purchase) parts.push(`закупка ${rub(c.old_purchase)} → ${rub(c.new_purchase)}`);
    if (c.new_status && c.new_status !== c.old_status) parts.push(`наличие: ${c.old_status ?? '—'} → ${c.new_status}`);
    if (c.new_visible != null && c.new_visible !== c.old_visible) parts.push(c.new_visible ? 'показана в магазине' : 'скрыта из магазина');
    return parts.join(', ') || 'без изменений';
  };

  return (
    <div className="page adm">
      <AdmHeader title="История изменений" back="/admin" />
      {err && <div className="adm-err">{err}</div>}
      {!h && !err && <p className="adm-sub">Загружаю…</p>}
      {h && (
        <>
          <div className="adm-section">Загрузки прайсов</div>
          {h.imports.length === 0 && <p className="adm-hint">Пока не было</p>}
          {h.imports.map((i) => (
            <div key={i.id} className="adm-hist">
              <div className="adm-hist__top"><span>{fmtDate(i.at)}</span><span>{i.who}</span></div>
              <div className="adm-hist__what">{i.source}: строк {i.lines}, узнано {i.matched}, обновлено <b>{i.applied}</b></div>
            </div>
          ))}

          <div className="adm-section">Наценки и курс</div>
          {h.settings.length === 0 && <p className="adm-hint">Пока не меняли</p>}
          {h.settings.map((s) => (
            <div key={s.id} className="adm-hist">
              <div className="adm-hist__top"><span>{fmtDate(s.at)}</span><span>{s.who}</span></div>
              <div className="adm-hist__what">{s.what}</div>
            </div>
          ))}

          <div className="adm-section">Цены и наличие (последние 100)</div>
          {h.changes.length === 0 && <p className="adm-hint">Пока не меняли</p>}
          {h.changes.map((c) => (
            <div key={c.id} className="adm-hist">
              <div className="adm-hist__top"><span>{fmtDate(c.at)}, {c.source}</span><span>{c.who}</span></div>
              <div className="adm-hist__what"><b>{c.catalog_items?.name ?? `ID ${c.item_id}`}</b><br />{describe(c)}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
