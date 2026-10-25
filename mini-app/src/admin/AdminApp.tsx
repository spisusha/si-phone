import { useCallback, useEffect, useMemo, useState } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { adminCall, AdminError, isFresh, type AdminAuth, type CatalogData } from './api';
import { AdminContext, useAdmin, useDerived } from './context';
import { AdmHeader, AdmRow, IconBox, IconClock, IconPercent, IconUpload } from './ui';
import { ItemEdit, ProductsLevel, ProductsRoot } from './Products';
import ImportScreen from './Import';
import { HistoryScreen, PricingScreen } from './Pricing';
import { plural } from '../domain/plural';
import './admin.css';

// Новая админка (этап B3). Главная — четыре плашки, дальше по уровням, как в каталоге магазина.

function Home() {
  const navigate = useNavigate();
  const { data, logout } = useAdmin();
  const { shopRate, usd, fxMargin, markup } = useDerived();
  const ask = data.items.filter((i) => i.status === 'уточнить').length;
  const fresh = data.items.filter((i) => isFresh(i.confirmed_at)).length;
  const pcts = Object.values(markup);
  const range = pcts.length ? `${Math.min(...pcts)}–${Math.max(...pcts)} %` : '—';

  return (
    <div className="page adm">
      <AdmHeader
        title="Админка"
        right={logout && <button className="btn btn-outline admin-topbar__logout" onClick={logout}>Выйти</button>}
      />
      <p className="adm-who">Вы вошли: {data.who}</p>

      <div className="catalog-models">
        <AdmRow
          icon={<IconBox />}
          title="Товары и цены"
          sub={`${plural(data.items.length, ['позиция', 'позиции', 'позиций'])}${fresh ? `, новых цен ${fresh}` : ''}${ask ? `, уточнить ${ask}` : ''}`}
          onClick={() => navigate('/admin/products')}
        />
        <AdmRow icon={<IconUpload />} title="Загрузить прайс" sub="Текст или Excel от поставщика" onClick={() => navigate('/admin/import')} />
        <AdmRow
          icon={<IconPercent />}
          title="Наценки и курс"
          sub={`Курс ${shopRate ? shopRate.toFixed(2) : '—'} ₽ (ЦБ ${usd?.toFixed(2) ?? '—'} + ${fxMargin} %), наценка ${range}`}
          onClick={() => navigate('/admin/pricing')}
        />
        <AdmRow icon={<IconClock />} title="История изменений" sub="Кто, когда и что поменял" onClick={() => navigate('/admin/history')} />
      </div>
    </div>
  );
}

export default function AdminApp({ auth, logout, onDenied }: { auth: AdminAuth; logout: (() => void) | null; onDenied: () => void }) {
  const [data, setData] = useState<CatalogData | null>(null);
  const [err, setErr] = useState('');

  const call = useCallback(async <T,>(action: string, payload: Record<string, unknown> = {}) => {
    try {
      return await adminCall<T>(auth, action, payload);
    } catch (e) {
      if (e instanceof AdminError && e.status === 401) onDenied();
      throw e;
    }
  }, [auth, onDenied]);

  const reload = useCallback(async () => {
    const d = await call<CatalogData>('catalog');
    setData(d);
  }, [call]);

  useEffect(() => {
    reload().catch((e) => setErr(e instanceof Error ? e.message : 'Не получилось загрузить'));
  }, [reload]);

  const value = useMemo(() => (data ? { auth, data, reload, call, logout } : null), [auth, data, reload, call, logout]);

  if (err) return <div className="page adm"><AdmHeader title="Админка" /><div className="adm-err">{err}</div></div>;
  if (!value) return <div className="page adm"><AdmHeader title="Админка" /><p className="adm-sub">Загружаю каталог…</p></div>;

  return (
    <AdminContext.Provider value={value}>
      <Routes>
        <Route index element={<Home />} />
        <Route path="products" element={<ProductsRoot />} />
        <Route path="products/:cat" element={<ProductsLevel />} />
        <Route path="products/:cat/:gen" element={<ProductsLevel />} />
        <Route path="products/:cat/:gen/:line" element={<ProductsLevel />} />
        <Route path="item/:id" element={<ItemEdit />} />
        <Route path="import" element={<ImportScreen />} />
        <Route path="pricing" element={<PricingScreen />} />
        <Route path="history" element={<HistoryScreen />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </AdminContext.Provider>
  );
}
