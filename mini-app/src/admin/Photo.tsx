import { useState } from 'react';
import { supabase } from '../api/supabaseClient';
import { useAdmin } from './context';
import { processPhoto, type Processed } from './photoProcess';

// Фото позиции: требования, где искать, до 5 фото на «модель + цвет» (первое — главное, на карточках и плашках;
// остальные листаются в карточке товара), автоматическая подготовка каждого нового фото.

const MAX_PHOTOS = 5;

export function PhotoRules() {
  return (
    <details className="adm-card adm-rules">
      <summary><b>Какое фото подходит и где его взять</b></summary>
      <p><b>Нужно:</b> товар целиком; главное фото — вид спереди, как у остальных фото этой модели; дополнительные — сзади, сбоку,
        под углом. Фон белый или прозрачный; без теней, отражений и «пола» под товаром; без надписей, водяных знаков, рамок, рук
        и коробки; от 800×800 пикселей; JPG, PNG или WebP.</p>
      <p><b>Где искать:</b> сайт Apple — страница покупки модели (apple.com/shop/buy-iphone и т. п.): выберите цвет, полистайте
        картинки товара и сохраните нужные (правой кнопкой «Сохранить изображение»); если на сайте одной страны нет — сайт Apple
        другой страны. В крайнем случае — крупные магазины с фото на белом фоне (re:Store, Store77). Фото «на столе», в руке
        или с тенью не подойдут.</p>
      <p><b>Остальное админка сделает сама:</b> уберёт белый фон, обрежет края и поставит товар по центру квадрата 1000×1000,
        как у всех фото магазина. Перед сохранением покажет, что получилось.</p>
    </details>
  );
}

const checker: React.CSSProperties = {
  width: '100%', aspectRatio: '1', objectFit: 'contain', borderRadius: 10,
  background: 'repeating-conic-gradient(#e9e9ee 0 25%, #fff 0 50%) 0 0 / 20px 20px',
};

/**
 * Галерея фото для позиций одного цвета.
 * groupKey — ключ набора (сохраняется у позиций), uploadBase — начало имени новых файлов (своё у каждой модели,
 * чтобы не перезаписать фото другой модели того же дизайна).
 */
export function PhotoGallery({ groupKey, uploadBase, itemIds, current, label }: {
  groupKey: string; uploadBase: string; itemIds: number[]; current: string[]; label: string;
}) {
  const { call, reload } = useAdmin();
  const [src, setSrc] = useState<string | null>(null);
  const [res, setRes] = useState<Processed | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const saveSet = async (urls: string[], okText: string) => {
    await call('set-photos', { key: groupKey, urls, itemIds });
    await reload();
    setMsg({ ok: true, text: okText });
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Не получилось' }); } finally { setBusy(false); }
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setMsg(null); setRes(null);
    setSrc(URL.createObjectURL(f));
    await run(async () => setRes(await processPhoto(f)));
  };

  const add = () => run(async () => {
    if (!res || !supabase) return;
    const key = `${uploadBase}-x${Date.now().toString(36)}`.slice(0, 100);
    const up = await call<{ path: string; token: string; url: string }>('photo-upload', { key, ext: res.ext });
    const { error } = await supabase.storage.from('products')
      .uploadToSignedUrl(up.path, up.token, res.blob, { contentType: `image/${res.ext}`, upsert: true });
    if (error) throw new Error(`Загрузка: ${error.message}`);
    await saveSet([...current, up.url].slice(0, MAX_PHOTOS), current.length ? 'Фото добавлено' : 'Фото добавлено — оно главное');
    setSrc(null); setRes(null);
  });

  const makeMain = (i: number) => run(() => saveSet([current[i], ...current.filter((_, j) => j !== i)], 'Главное фото изменено'));
  const remove = (i: number) => {
    if (!window.confirm(current.length === 1 ? 'Удалить единственное фото? В магазине будет заглушка.' : 'Удалить это фото?')) return;
    run(() => saveSet(current.filter((_, j) => j !== i), 'Фото удалено'));
  };

  return (
    <div>
      {msg && <div className={msg.ok ? 'adm-ok' : 'adm-err'}>{msg.text}</div>}
      {current.length > 0 && (
        <div className="adm-gallery">
          {current.map((u, i) => (
            <div key={u} className="adm-gallery__item">
              <img src={u} alt="" style={checker} />
              {i === 0 ? <span className="adm-tag adm-tag--fresh" style={{ marginLeft: 0 }}>Главное</span>
                : <button className="adm-link" disabled={busy} onClick={() => makeMain(i)}>Сделать главным</button>}
              <button className="adm-link adm-link--danger" disabled={busy} onClick={() => remove(i)}>Удалить</button>
            </div>
          ))}
        </div>
      )}
      <div className="adm-hint" style={{ margin: '8px 0 10px' }}>
        {current.length}/{MAX_PHOTOS} фото, общие для {label}. Первое — на карточках в каталоге, остальные листаются в карточке товара.
      </div>

      {current.length < MAX_PHOTOS && (
        <label className="btn btn-ghost" style={{ display: 'flex', minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          {busy && !res ? 'Обрабатываю…' : res ? 'Выбрать другое фото' : '+ Добавить фото'}
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      )}
      {src && res && (
        <>
          <div className="adm-row2" style={{ marginTop: 12 }}>
            <div><div className="adm-label">Было</div><img src={src} alt="" style={checker} /></div>
            <div><div className="adm-label">Станет</div><img src={res.url} alt="" style={checker} /></div>
          </div>
          <div className="adm-hint">{res.bgRemoved ? 'Фон убран, ' : ''}товар по центру 1000×1000, {res.ext.toUpperCase()}, {Math.round(res.blob.size / 1024)} КБ</div>
          {res.warnings.map((w) => <div key={w} className="adm-warn" style={{ fontSize: 13, marginTop: 6 }}>{w}</div>)}
          <div className="adm-actions">
            <button className="btn btn-ghost" disabled={busy} onClick={() => { setSrc(null); setRes(null); }}>Отмена</button>
            <button className="btn btn-primary" disabled={busy} onClick={add}>{busy ? 'Сохраняю…' : current.length ? 'Добавить фото' : 'Сделать главным фото'}</button>
          </div>
        </>
      )}
    </div>
  );
}
