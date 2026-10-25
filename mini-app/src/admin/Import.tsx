import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin, useDerived } from './context';
import { AdmHeader } from './ui';
import { rub, round500, type PreviewLine } from './api';
import { xlsxToText } from '../../supabase/functions/_shared/xlsxText';

// «Загрузить прайс»: текст или Excel → сервер распознаёт строки → менеджер проверяет галочки → «Применить».
// Ничего не меняется, пока не нажата «Применить». Большой скачок цены (больше 30 %) по умолчанию не отмечен.

const BIG_JUMP = 0.3;

interface Pick { itemId: number | null; on: boolean }

export default function ImportScreen() {
  const navigate = useNavigate();
  const { call, reload } = useAdmin();
  const { itemById, costById, modelById, markup } = useDerived();

  const [text, setText] = useState('');
  const [source, setSource] = useState('текст');
  const [lines, setLines] = useState<PreviewLine[] | null>(null);
  const [picks, setPicks] = useState<Record<number, Pick>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<number | null>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErr('');
    try {
      const t = /\.xlsx$/i.test(f.name) ? await xlsxToText(await f.arrayBuffer()) : await f.text();
      setText(t);
      setSource(`файл ${f.name}`.slice(0, 60));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не получилось прочитать файл');
    }
  };

  const recognize = async () => {
    setBusy(true); setErr(''); setDone(null);
    try {
      const res = await call<{ lines: PreviewLine[] }>('preview-import', { text });
      const p: Record<number, Pick> = {};
      for (const l of res.lines) {
        if (l.kind === 'match' && l.itemId && l.price) {
          const old = costById.get(l.itemId)?.purchase_price;
          const jump = old ? Math.abs(l.price / old - 1) : 0;
          p[l.line] = { itemId: l.itemId, on: jump <= BIG_JUMP };
        } else if (l.kind === 'choose') {
          p[l.line] = { itemId: null, on: false };
        }
      }
      setPicks(p);
      setLines(res.lines);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };

  const groups = useMemo(() => {
    const g = { match: [] as PreviewLine[], choose: [] as PreviewLine[], unknown: [] as PreviewLine[], skip: [] as PreviewLine[] };
    for (const l of lines ?? []) g[l.kind].push(l);
    return g;
  }, [lines]);

  const chosen = (lines ?? []).filter((l) => picks[l.line]?.on && picks[l.line]?.itemId && l.price);

  const apply = async () => {
    setBusy(true); setErr('');
    try {
      const res = await call<{ applied: number }>('apply-import', {
        items: chosen.map((l) => ({ id: picks[l.line].itemId, price: l.price })),
        source, lines: lines?.length ?? 0, matched: groups.match.length,
      });
      await reload();
      setDone(res.applied);
      setLines(null); setText('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };

  const shopPrice = (itemId: number, purchase: number) => {
    const cat = modelById.get(itemById.get(itemId)?.model_id ?? '')?.category ?? '';
    return round500(purchase * (1 + (markup[cat] ?? 0) / 100));
  };

  const LineView = ({ l }: { l: PreviewLine }) => {
    const pick = picks[l.line];
    const item = pick?.itemId ? itemById.get(pick.itemId) : undefined;
    const old = item ? costById.get(item.id)?.purchase_price : undefined;
    const jump = old && l.price ? l.price / old - 1 : 0;
    const set = (patch: Partial<Pick>) => setPicks((s) => ({ ...s, [l.line]: { ...s[l.line], ...patch } }));
    return (
      <div className="adm-line">
        <input type="checkbox" checked={!!pick?.on} disabled={!pick?.itemId} onChange={(e) => set({ on: e.target.checked })} />
        <div className="adm-line__main">
          <div className="adm-line__src">{l.text}</div>
          {l.kind === 'choose' && (
            <select className="adm-select" value={pick?.itemId ?? ''} onChange={(e) => set({ itemId: Number(e.target.value) || null, on: !!e.target.value })}>
              <option value="">Выберите, что это…</option>
              {l.candidates?.map((id) => <option key={id} value={id}>{itemById.get(id)?.name}</option>)}
            </select>
          )}
          {item && <div className="adm-line__name">{item.name}</div>}
          {item && l.price && (
            <div className="adm-line__price">
              Закупка {rub(old)} → <b>{rub(l.price)}</b>
              {old ? <span className={Math.abs(jump) > BIG_JUMP ? 'adm-warn' : jump > 0 ? 'adm-up' : 'adm-down'}> {jump > 0 ? '+' : ''}{Math.round(jump * 100)} %</span> : null}
              , в магазине {rub(shopPrice(item.id, l.price))}
              {Math.abs(jump) > BIG_JUMP && <div className="adm-warn">Большое изменение — проверьте и отметьте вручную</div>}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="page adm">
      <AdmHeader title="Загрузить прайс" back="/admin" />

      {done !== null && <div className="adm-ok">Готово: обновлено {done} позиций. Эти позиции 2 дня будут выше в магазине.</div>}
      {err && <div className="adm-err">{err}</div>}

      {!lines && (
        <>
          <p className="adm-sub">Вставьте прайс поставщика текстом или выберите файл Excel (.xlsx). Пока не нажата «Применить», в магазине ничего не меняется.</p>
          <div className="adm-file">
            <label className="btn btn-ghost">
              Выбрать файл
              <input type="file" accept=".xlsx,.csv,.txt" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {source !== 'текст' && <span className="adm-hint" style={{ marginTop: 0 }}>{source}</span>}
          </div>
          <textarea className="adm-textarea" placeholder={'iPhone 17 Pro Max 256 Cosmic Orange eSIM 115000\nAir 13 M5 16/512 Midnight 96500\n…'}
            value={text} onChange={(e) => { setText(e.target.value); if (source.startsWith('файл') && !e.target.value) setSource('текст'); }} />
          <div className="adm-actions">
            <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={recognize}>{busy ? 'Распознаю…' : 'Распознать'}</button>
          </div>
        </>
      )}

      {lines && (
        <>
          <div className="adm-summary">
            <span>Узнал {groups.match.length}</span>
            {groups.choose.length > 0 && <span>Выбрать {groups.choose.length}</span>}
            {groups.unknown.length > 0 && <span>Не понял {groups.unknown.length}</span>}
            {groups.skip.length > 0 && <span>Пропущено {groups.skip.length}</span>}
          </div>

          {groups.choose.length > 0 && <><div className="adm-section">Выберите вариант</div>{groups.choose.map((l) => <LineView key={l.line} l={l} />)}</>}
          {groups.match.length > 0 && <><div className="adm-section">Узнал</div>{groups.match.map((l) => <LineView key={l.line} l={l} />)}</>}
          {groups.unknown.length > 0 && (
            <>
              <div className="adm-section">Не понял — цену можно поставить вручную в «Товары и цены»</div>
              {groups.unknown.map((l) => (
                <div key={l.line} className="adm-line"><div className="adm-line__main"><div className="adm-line__src">{l.text}</div><div className="adm-hint" style={{ marginTop: 2 }}>{l.reason}</div></div></div>
              ))}
            </>
          )}
          {groups.skip.length > 0 && (
            <details>
              <summary className="adm-section" style={{ cursor: 'pointer' }}>Пропущено {groups.skip.length}</summary>
              {groups.skip.map((l) => (
                <div key={l.line} className="adm-line"><div className="adm-line__main"><div className="adm-line__src">{l.text}</div><div className="adm-hint" style={{ marginTop: 2 }}>{l.reason}</div></div></div>
              ))}
            </details>
          )}

          <div className="adm-sticky">
            <div className="adm-actions">
              <button className="btn btn-ghost" onClick={() => setLines(null)}>Назад</button>
              <button className="btn btn-primary" disabled={busy || !chosen.length} onClick={apply}>
                {busy ? 'Применяю…' : `Применить (${chosen.length})`}
              </button>
            </div>
          </div>
        </>
      )}

      {done !== null && !lines && (
        <div className="adm-actions"><button className="btn btn-ghost" onClick={() => navigate('/admin/history')}>Посмотреть историю</button></div>
      )}
    </div>
  );
}
