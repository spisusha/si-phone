import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PhotoGallery, PhotoRules } from './Photo';
import { photoKeyFor } from './NewItem';
import type { Category, ProductFamily } from '../domain/types';
import { ALL_CATEGORIES } from '../domain/types';
import { genTitle, groupTabs, lineTitle, modelPlace } from '../domain/catalogTree';
import { useAdmin, useDerived } from './context';
import { AdmHeader, AdmRow } from './ui';
import { isFresh, rub, round500, shortName, type AItem } from './api';
import { plural } from '../domain/plural';

// «Товары и цены»: те же уровни, что в каталоге магазина (категория → поколение → линейка → позиции),
// плюс поиск сразу по всем позициям. Нажатие на позицию — карточка правки.

const SLUG: Record<string, Category> = { iphone: 'iPhone', ipad: 'iPad', macbook: 'MacBook', watch: 'Watch', airpods: 'AirPods' };
const seg = (id: string) => encodeURIComponent(id || 'all');
const unseg = (s?: string) => (s === undefined ? undefined : s === 'all' ? '' : decodeURIComponent(s));

function useFamilies(): ProductFamily[] {
  const { data } = useAdmin();
  return useMemo(() => {
    const photo = new Map<string, string>();
    for (const i of data.items) if (i.photo_url && !photo.has(i.model_id)) photo.set(i.model_id, i.photo_url);
    return data.models.map((m) => ({
      id: m.id, category: m.category, title: m.title, description: '', images: photo.get(m.id) ? [photo.get(m.id)!] : [],
      popularity_score: m.sort, created_at: '',
    }));
  }, [data]);
}

function counts(items: AItem[]) {
  const ask = items.filter((i) => i.status === 'уточнить').length;
  const hidden = items.filter((i) => !i.visible).length;
  const fresh = items.filter((i) => isFresh(i.confirmed_at)).length;
  const parts = [plural(items.length, ['позиция', 'позиции', 'позиций'])];
  if (fresh) parts.push(`новых цен ${fresh}`);
  if (ask) parts.push(`уточнить ${ask}`);
  if (hidden) parts.push(`скрыто ${hidden}`);
  return parts.join(', ');
}

export function ItemRow({ item, title }: { item: AItem; title: string }) {
  const navigate = useNavigate();
  const { costById } = useDerived();
  const cost = costById.get(item.id);
  return (
    <button className="adm-item" onClick={() => navigate(`/admin/item/${item.id}`)}>
      <img src={item.photo_url || '/placeholder.svg'} alt="" loading="lazy" />
      <div className="adm-item__main">
        <div className="adm-item__name">
          {title}
          {item.status === 'уточнить' && <span className="adm-tag adm-tag--ask">уточнить</span>}
          {!item.visible && <span className="adm-tag adm-tag--hidden">скрыт</span>}
          {isFresh(item.confirmed_at) && <span className="adm-tag adm-tag--fresh">новая цена</span>}
        </div>
        <div className="adm-item__meta">Закупка {rub(cost?.purchase_price)}</div>
      </div>
      <span className="adm-item__price">{rub(item.price)}</span>
    </button>
  );
}

export function ProductsRoot() {
  const { data } = useAdmin();
  const { modelById } = useDerived();
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const found = useMemo(() => {
    const words = q.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return data.items.filter((i) => {
      const hay = `${i.name} ${i.id}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    }).slice(0, 60);
  }, [q, data.items]);

  return (
    <div className="page adm">
      <AdmHeader title="Товары и цены" back="/admin" />
      <input className="adm-search" placeholder="Поиск: 17 pro max 256 orange" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim() ? (
        <>
          <div className="adm-section">Найдено {found.length}{found.length === 60 ? '+' : ''}</div>
          {found.map((i) => <ItemRow key={i.id} item={i} title={i.name} />)}
        </>
      ) : (
        <>
          <div className="catalog-models">
            {ALL_CATEGORIES.map((cat) => {
              const items = data.items.filter((i) => modelById.get(i.model_id)?.category === cat);
              const photo = items.find((i) => i.photo_url)?.photo_url;
              return <AdmRow key={cat} title={cat} sub={counts(items)} image={photo} onClick={() => navigate(`/admin/products/${cat.toLowerCase()}`)} />;
            })}
          </div>
          <div className="adm-actions">
            <button className="btn btn-ghost" onClick={() => navigate('/admin/new-model')}>+ Новая модель</button>
          </div>
          <p className="adm-hint">Новый цвет или объём у существующей модели — кнопка «+ Добавить позицию» внутри модели.</p>
        </>
      )}
    </div>
  );
}

export function ProductsLevel() {
  const { cat: slug, gen: genSeg, line: lineSeg } = useParams();
  const navigate = useNavigate();
  const { data } = useAdmin();
  const families = useFamilies();
  const category = SLUG[slug ?? ''];
  const base = `/admin/products/${slug}`;

  const itemsOf = (fs: ProductFamily[]) => {
    const ids = new Set(fs.map((f) => f.id));
    return data.items.filter((i) => ids.has(i.model_id));
  };

  if (!category) return <div className="page adm"><AdmHeader title="Не найдено" back="/admin/products" /></div>;
  const models = families.filter((f) => f.category === category);
  const gens = groupTabs(models, (f) => modelPlace(f).gen);

  let gen = unseg(genSeg);
  if (gen === undefined && gens.length > 1) {
    return (
      <div className="page adm">
        <AdmHeader title={category} back="/admin/products" />
        <div className="catalog-models">
          {gens.map((g) => (
            <AdmRow key={g.id} title={genTitle(category, g.id)} sub={counts(itemsOf(g.families))} image={g.families[0]?.images[0]}
              onClick={() => navigate(`${base}/${seg(g.id)}`)} />
          ))}
        </div>
      </div>
    );
  }
  gen = gen ?? gens[0]?.id ?? '';
  const genTab = gens.find((g) => g.id === gen);
  if (!genTab) return <div className="page adm"><AdmHeader title="Не найдено" back={base} /></div>;
  const lines = groupTabs(genTab.families, (f) => modelPlace(f).line);
  const genBack = gens.length > 1 ? base : '/admin/products';

  let line = unseg(lineSeg);
  if (line === undefined && lines.length > 1) {
    return (
      <div className="page adm">
        <AdmHeader title={gens.length > 1 ? genTitle(category, gen) : category} back={genBack} />
        <div className="catalog-models">
          {lines.map((l) => (
            <AdmRow key={l.id} title={lineTitle(category, gen!, l.id)} sub={counts(itemsOf(l.families))} image={l.families[0]?.images[0]}
              onClick={() => navigate(`${base}/${seg(gen!)}/${seg(l.id)}`)} />
          ))}
        </div>
      </div>
    );
  }
  line = line ?? lines[0]?.id ?? '';
  const lineTab = lines.find((l) => l.id === line);
  if (!lineTab) return <div className="page adm"><AdmHeader title="Не найдено" back={genBack} /></div>;

  return (
    <div className="page adm">
      <AdmHeader title={lineTitle(category, gen, line)} back={lines.length > 1 ? `${base}/${seg(gen)}` : genBack} />
      {lineTab.families.map((f) => {
        const items = data.items.filter((i) => i.model_id === f.id);
        return (
          <div key={f.id}>
            {lineTab.families.length > 1 && <div className="adm-section">{f.title}</div>}
            {items.map((i) => <ItemRow key={i.id} item={i} title={shortName(i, f.title)} />)}
            <button className="btn btn-ghost" style={{ width: '100%', minHeight: 44, marginTop: 4 }} onClick={() => navigate(`/admin/new-item/${f.id}`)}>
              + Добавить позицию{lineTab.families.length > 1 ? ` в ${f.title}` : ''}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ItemEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data, call, reload } = useAdmin();
  const { itemById, costById, modelById, markup } = useDerived();
  const item = itemById.get(Number(id));
  const cost = item ? costById.get(item.id) : undefined;
  const model = item ? modelById.get(item.model_id) : undefined;

  const [purchase, setPurchase] = useState(cost ? String(cost.purchase_price) : '');
  const [status, setStatus] = useState(item?.status ?? 'в наличии');
  const [visible, setVisible] = useState(item?.visible ?? true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!item || !model) return <div className="page adm"><AdmHeader title="Позиция не найдена" back="/admin/products" /></div>;

  const p = Number(purchase.replace(/\D/g, ''));
  const pct = markup[model.category] ?? 0;
  const preview = p >= 1000 ? round500(p * (1 + pct / 100)) : null;
  const priceChanged = p !== (cost?.purchase_price ?? 0);
  const flagsChanged = status !== item.status || visible !== item.visible;
  const back = `/admin/products/${model.category.toLowerCase()}`;
  // Фото — одно на «модель + цвет» (у часов — «корпус + ремешок»): все объёмы памяти этого цвета
  const sameLook = data.items.filter((i) => i.model_id === item.model_id &&
    (item.band ? i.band === item.band : (i.color ?? '') === (item.color ?? '')));
  const lookLabel = item.band || item.color || model.title;

  const save = async () => {
    if (priceChanged && !(p >= 1000 && p <= 5_000_000)) { setMsg({ ok: false, text: 'Закупка — от 1 000 до 5 000 000 ₽' }); return; }
    setBusy(true); setMsg(null);
    try {
      await call('save-item', {
        id: item.id,
        ...(priceChanged ? { purchase: p } : {}),
        ...(flagsChanged || priceChanged ? { status: priceChanged ? 'в наличии' : status, visible } : {}),
      });
      await reload();
      setMsg({ ok: true, text: priceChanged ? 'Сохранено. Новая цена в магазине сразу, позиция 2 дня выше в списке' : 'Сохранено' });
      if (priceChanged) setStatus('в наличии');
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Не получилось' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page adm">
      <AdmHeader title={model.title} back={back} />
      <div className="adm-card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <img src={item.photo_url || '/placeholder.svg'} alt="" style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 10, background: 'var(--color-media-bg)' }} />
        <div>
          <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{shortName(item, model.title)}</div>
          <div className="adm-big" style={{ marginTop: 4 }}>{rub(item.price)}</div>
          <div className="adm-hint" style={{ marginTop: 2 }}>сейчас в магазине, ID {item.id}</div>
        </div>
      </div>

      {msg && <div className={msg.ok ? 'adm-ok' : 'adm-err'}>{msg.text}</div>}

      <div className="adm-field">
        <label className="adm-label" htmlFor="purchase">Закупка, ₽</label>
        <input id="purchase" className="adm-input" inputMode="numeric" value={purchase}
          onChange={(e) => setPurchase(e.target.value.replace(/[^\d\s]/g, ''))} />
        <div className="adm-hint">
          {preview ? <>В магазине будет <b>{rub(preview)}</b> (наценка {model.category} {pct} %)</> : 'Введите закупочную цену'}
          {cost && <><br />Сейчас: {rub(cost.purchase_price)} от {new Date(cost.purchase_date).toLocaleDateString('ru-RU')}{cost.source ? `, ${cost.source}` : ''}</>}
        </div>
      </div>

      <div className="adm-field">
        <span className="adm-label">Наличие</span>
        <div className="adm-seg">
          <button className={status === 'в наличии' ? 'on' : ''} onClick={() => setStatus('в наличии')}>В наличии</button>
          <button className={status === 'уточнить' ? 'on-ask' : ''} onClick={() => setStatus('уточнить')}>Уточнить</button>
        </div>
        <div className="adm-hint">«Уточнить» — в магазине оранжевая плашка, в корзину нельзя</div>
      </div>

      <div className="adm-field">
        <span className="adm-label">В магазине</span>
        <div className="adm-seg">
          <button className={visible ? 'on' : ''} onClick={() => setVisible(true)}>Показывать</button>
          <button className={!visible ? 'on-ask' : ''} onClick={() => setVisible(false)}>Скрыть</button>
        </div>
      </div>

      <div className="adm-actions">
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>Назад</button>
        <button className="btn btn-primary" disabled={busy || (!priceChanged && !flagsChanged)} onClick={save}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </div>

      <div className="adm-section" id="photo">Фото</div>
      {params.get('new') && !item.photo_url && <div className="adm-ok">Позиция добавлена. Осталось фото — загрузите его ниже.</div>}
      {params.get('new') && item.photo_url && <div className="adm-ok">Позиция добавлена, фото взято у этого же цвета.</div>}
      <PhotoRules />
      <PhotoGallery
        groupKey={item.photo_key ?? photoKeyFor(model.id, item)}
        uploadBase={photoKeyFor(model.id, item)}
        itemIds={sameLook.map((i) => i.id)}
        current={[item.photo_url, ...(item.extra_photos ?? [])].filter((u): u is string => !!u)}
        label={`${lookLabel} (${plural(sameLook.length, ['позиция', 'позиции', 'позиций'])} этой модели)`}
      />
    </div>
  );
}
