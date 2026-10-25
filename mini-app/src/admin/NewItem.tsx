import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Category } from '../domain/types';
import { ALL_CATEGORIES } from '../domain/types';
import { useAdmin, useDerived } from './context';
import { AdmHeader } from './ui';
import { rub, round500, type AItem } from './api';

// «Новая модель» и «Новая позиция». Название позиции собирается по тем же правилам, что у 837 позиций каталога,
// синонимы для прайсов сервер берёт у соседей по модели. ID — следующий по порядку.

const slug = (s: string) => s.toLowerCase().replace(/["″]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const uniq = (a: (string | null | undefined)[]) => [...new Set(a.filter((x): x is string => !!x))];

export function buildName(cat: Category, title: string, f: Record<string, string>): string {
  const parts = (() => {
    switch (cat) {
      case 'iPhone': return [title, f.storage, f.color, f.sim];
      case 'iPad': return [title, f.storage, f.sim, f.color];
      case 'MacBook': return [title, f.ram_ssd, f.color, f.keyboard === 'РУС' ? 'РУС' : ''];
      case 'Watch': return [title, f.size, (f.band || '').replace(' / ', ' ')];
      case 'AirPods': return [title, f.color];
    }
  })();
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** Ключ фото: «модель-цвет» (у часов — «модель-корпус-ремешок») */
export function photoKeyFor(modelId: string, item: Pick<AItem, 'color' | 'band'>): string {
  return `${modelId}-${slug(item.band || item.color || 'main')}`.slice(0, 80).replace(/-+$/, '');
}

export function NewModel() {
  const { cat } = useParams();
  const navigate = useNavigate();
  const { data, call, reload } = useAdmin();
  const [category, setCategory] = useState<Category>((ALL_CATEGORIES.find((c) => c.toLowerCase() === cat) ?? 'iPhone'));
  const [title, setTitle] = useState('');
  const [after, setAfter] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const models = data.models.filter((m) => m.category === category);

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const r = await call<{ id: string }>('add-model', { category, title, after: after || null });
      await reload();
      navigate(`/admin/new-item/${r.id}`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Не получилось'); } finally { setBusy(false); }
  };

  return (
    <div className="page adm">
      <AdmHeader title="Новая модель" back="/admin/products" />
      {err && <div className="adm-err">{err}</div>}
      <div className="adm-field">
        <span className="adm-label">Категория</span>
        <select className="adm-select" value={category} onChange={(e) => { setCategory(e.target.value as Category); setAfter(''); }}>
          {ALL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="adm-field">
        <label className="adm-label" htmlFor="mtitle">Название модели</label>
        <input id="mtitle" className="adm-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={
          { iPhone: 'iPhone 19 Pro', iPad: 'iPad Pro 13" M6', MacBook: 'MacBook Air 13" M6', Watch: 'Apple Watch Series 13', AirPods: 'AirPods Pro 4' }[category]} />
        <div className="adm-hint">Латиницей, точно как у Apple: от этого зависит, в какую плашку каталога попадёт модель и как её узнают прайсы.
          {category === 'iPad' || category === 'MacBook' ? ' Размер и чип пишите в названии: 13" M6.' : ''}</div>
      </div>
      <div className="adm-field">
        <span className="adm-label">Место в списке</span>
        <select className="adm-select" value={after} onChange={(e) => setAfter(e.target.value)}>
          <option value="">Самая новая — в начало</option>
          {models.map((m) => <option key={m.id} value={m.id}>после {m.title}</option>)}
        </select>
      </div>
      <div className="adm-actions">
        <button className="btn btn-primary" disabled={busy || title.trim().length < 3} onClick={save}>{busy ? 'Создаю…' : 'Создать и добавить позицию'}</button>
      </div>
    </div>
  );
}

export function NewItem() {
  const { modelId } = useParams();
  const navigate = useNavigate();
  const { data, call, reload } = useAdmin();
  const { modelById, markup } = useDerived();
  const model = modelById.get(modelId ?? '');
  const items = useMemo(() => data.items.filter((i) => i.model_id === modelId), [data.items, modelId]);
  const tpl = items[0];
  const cat = model?.category ?? 'iPhone';

  const colors = useMemo(() => {
    const m = new Map<string, AItem>();
    for (const i of items) if (i.color && !m.has(i.color)) m.set(i.color, i);
    return [...m.values()];
  }, [items]);

  const [f, setF] = useState<Record<string, string>>(() => ({
    storage: '', sim: tpl?.sim ?? (cat === 'iPad' ? 'Wi-Fi' : cat === 'iPhone' ? 'SIM+eSIM' : ''),
    ram_ssd: '', keyboard: 'EN', size: cat === 'Watch' ? (tpl?.size ?? '') : '', band: '',
    color: colors[0]?.color ?? '', newColor: '', newColorRu: '', newColorHex: '#cccccc',
    purchase: '', status: 'в наличии',
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  if (!model) return <div className="page adm"><AdmHeader title="Нет такой модели" back="/admin/products" /></div>;

  const isNewColor = f.color === '__new' || (!colors.length && cat !== 'Watch');
  const colorRow = isNewColor ? null : colors.find((c) => c.color === f.color) ?? null;
  const color = isNewColor ? f.newColor.trim() : f.color;
  const fields = { ...f, color };
  const name = buildName(cat, model.title, fields);
  const p = Number(f.purchase.replace(/\D/g, ''));
  const preview = p >= 1000 ? round500(p * (1 + (markup[cat] ?? 0) / 100)) : null;
  const sizeFromTitle = /(\d+(?:\.\d)?)"/.exec(model.title)?.[1];
  const chipFromTitle = /\b(M\d+(?: Pro| Max)?|A\d+(?: Pro)?)\b/.exec(model.title)?.[1] ?? tpl?.chip ?? null;
  const dup = data.items.some((i) => i.name === name);

  const missing = [
    (cat === 'iPhone' || cat === 'iPad') && !f.storage && 'память',
    cat === 'MacBook' && !f.ram_ssd && 'память и накопитель',
    cat === 'Watch' && (!f.size || !f.band) && 'размер и ремешок',
    cat !== 'Watch' && cat !== 'AirPods' && !color && 'цвет',
    !(p >= 1000) && 'закупка',
  ].filter(Boolean);

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const item = {
        model_id: model.id, name, year: tpl?.year ?? new Date().getFullYear(),
        storage: f.storage || null, color: color || null,
        color_ru: isNewColor ? f.newColorRu.trim() || null : colorRow?.color_ru ?? null,
        color_hex: color ? (isNewColor ? f.newColorHex : colorRow?.color_hex ?? null) : null,
        sim: cat === 'iPhone' || cat === 'iPad' ? f.sim : null,
        size: cat === 'Watch' ? f.size : sizeFromTitle ? `${sizeFromTitle}"` : tpl?.size ?? null,
        chip: chipFromTitle, ram_ssd: cat === 'MacBook' ? f.ram_ssd : null,
        band: cat === 'Watch' ? f.band : null, keyboard: cat === 'MacBook' ? (f.keyboard === 'РУС' ? 'РУС' : '') : '',
        status: f.status, visible: true,
        // фото того же цвета в модели — сразу; нового цвета — загрузите на следующем экране
        photo_key: colorRow?.photo_key ?? null, photo_url: colorRow?.photo_url ?? null,
        purchase: p,
      };
      const r = await call<{ id: number }>('add-item', { item });
      await reload();
      navigate(`/admin/item/${r.id}?new=1`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Не получилось'); } finally { setBusy(false); }
  };

  const list = (id: string, values: (string | null | undefined)[]) => (
    <datalist id={id}>{uniq(values).map((v) => <option key={v} value={v} />)}</datalist>
  );

  return (
    <div className="page adm">
      <AdmHeader title="Новая позиция" back="/admin/products" />
      <p className="adm-sub">{model.title}</p>
      {err && <div className="adm-err">{err}</div>}

      {(cat === 'iPhone' || cat === 'iPad') && (
        <div className="adm-field">
          <span className="adm-label">Память</span>
          <input className="adm-input" list="dl-storage" value={f.storage} onChange={(e) => set('storage', e.target.value.toUpperCase().replace(/\s/g, ''))} placeholder="256GB" />
          {list('dl-storage', [...items.map((i) => i.storage), '128GB', '256GB', '512GB', '1TB', '2TB'])}
        </div>
      )}
      {cat === 'MacBook' && (
        <div className="adm-field">
          <span className="adm-label">Память и накопитель</span>
          <input className="adm-input" list="dl-ram" value={f.ram_ssd} onChange={(e) => set('ram_ssd', e.target.value.toUpperCase().replace(/\s/g, ''))} placeholder="16GB/512GB" />
          {list('dl-ram', items.map((i) => i.ram_ssd))}
        </div>
      )}
      {cat === 'Watch' && (
        <>
          <div className="adm-field">
            <span className="adm-label">Размер корпуса</span>
            <input className="adm-input" list="dl-size" value={f.size} onChange={(e) => set('size', e.target.value.replace(/\s/g, ''))} placeholder="46mm" />
            {list('dl-size', items.map((i) => i.size))}
          </div>
          <div className="adm-field">
            <span className="adm-label">Корпус / ремешок</span>
            <input className="adm-input" list="dl-band" value={f.band} onChange={(e) => set('band', e.target.value)} placeholder="Aluminum Black / Black Sport Band" />
            {list('dl-band', items.map((i) => i.band))}
            <div className="adm-hint">Как у Apple: «материал и цвет корпуса / название ремешка»</div>
          </div>
        </>
      )}

      {cat !== 'Watch' && (
        <div className="adm-field">
          <span className="adm-label">Цвет</span>
          {colors.length > 0 && (
            <select className="adm-select" value={f.color} onChange={(e) => set('color', e.target.value)}>
              {colors.map((c) => <option key={c.color!} value={c.color!}>{c.color}{c.color_ru ? ` — ${c.color_ru}` : ''}</option>)}
              <option value="__new">Новый цвет…</option>
            </select>
          )}
          {isNewColor && (
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              <input className="adm-input" value={f.newColor} onChange={(e) => set('newColor', e.target.value)} placeholder="Название как у Apple: Cosmic Orange" />
              <input className="adm-input" value={f.newColorRu} onChange={(e) => set('newColorRu', e.target.value)} placeholder="По-русски: Космический оранжевый" />
              <label className="adm-hint" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="color" value={f.newColorHex} onChange={(e) => set('newColorHex', e.target.value)} /> цвет кружка на витрине
              </label>
            </div>
          )}
          {colorRow?.photo_url && <div className="adm-hint">Фото возьмём у этого цвета — оно уже есть</div>}
          {isNewColor && <div className="adm-hint">Фото нового цвета загрузите на следующем экране</div>}
        </div>
      )}

      {cat === 'iPhone' && (
        <div className="adm-field">
          <span className="adm-label">SIM</span>
          <div className="adm-seg">
            {['SIM+eSIM', 'eSIM'].map((s) => <button key={s} className={f.sim === s ? 'on' : ''} onClick={() => set('sim', s)}>{s}</button>)}
          </div>
        </div>
      )}
      {cat === 'iPad' && (
        <div className="adm-field">
          <span className="adm-label">Связь</span>
          <div className="adm-seg">
            {['Wi-Fi', 'Wi-Fi+Cellular'].map((s) => <button key={s} className={f.sim === s ? 'on' : ''} onClick={() => set('sim', s)}>{s}</button>)}
          </div>
        </div>
      )}
      {cat === 'MacBook' && (
        <div className="adm-field">
          <span className="adm-label">Клавиатура</span>
          <div className="adm-seg">
            <button className={f.keyboard !== 'РУС' ? 'on' : ''} onClick={() => set('keyboard', 'EN')}>Английская</button>
            <button className={f.keyboard === 'РУС' ? 'on' : ''} onClick={() => set('keyboard', 'РУС')}>С русскими буквами</button>
          </div>
        </div>
      )}

      <div className="adm-field">
        <label className="adm-label" htmlFor="npurchase">Закупка, ₽</label>
        <input id="npurchase" className="adm-input" inputMode="numeric" value={f.purchase} onChange={(e) => set('purchase', e.target.value.replace(/[^\d\s]/g, ''))} />
        <div className="adm-hint">{preview ? <>В магазине будет <b>{rub(preview)}</b> (наценка {cat} {markup[cat] ?? 0} %)</> : 'Введите закупочную цену'}</div>
      </div>

      <div className="adm-field">
        <span className="adm-label">Наличие</span>
        <div className="adm-seg">
          <button className={f.status === 'в наличии' ? 'on' : ''} onClick={() => set('status', 'в наличии')}>В наличии</button>
          <button className={f.status === 'уточнить' ? 'on-ask' : ''} onClick={() => set('status', 'уточнить')}>Уточнить</button>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-label" style={{ marginBottom: 2 }}>Название в каталоге</div>
        <div style={{ fontWeight: 600 }}>{name}</div>
        {dup && <div className="adm-warn" style={{ fontSize: 13, marginTop: 4 }}>Такая позиция уже есть</div>}
        {missing.length > 0 && <div className="adm-hint">Заполните: {missing.join(', ')}</div>}
      </div>

      <div className="adm-actions">
        <button className="btn btn-primary" disabled={busy || dup || missing.length > 0} onClick={save}>{busy ? 'Добавляю…' : 'Добавить позицию'}</button>
      </div>
    </div>
  );
}
