import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { showBackButton } from '../telegram/telegramWebApp';
import BottomNav from '../components/BottomNav';
import HomeScreen from '../screens/HomeScreen';
import CatalogScreen from '../screens/CatalogScreen';
import CategoryModelsScreen from '../screens/CategoryModelsScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import SkuVariantScreen from '../screens/WatchVariantScreen';
import CartScreen from '../screens/CartScreen';
import CheckoutScreen from '../screens/CheckoutScreen';
import OrderResultScreen from '../screens/OrderResultScreen';
import ProfileScreen from '../screens/ProfileScreen';
import Loader from '../components/Loader';

// Админка грузится отдельно — покупатель её не скачивает.
const AdminScreen = lazy(() => import('../screens/AdminScreen'));

// Главные экраны (вкладки нижнего меню и экран заказа) — без кнопки «Назад».
const ROOT_PATHS = new Set(['/', '/catalog', '/cart', '/profile', '/result']);

// Куда вести «Назад», если истории нет (открыли сразу по ссылке на товар).
function parentPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'catalog') return '/' + parts.slice(0, -1).join('/');
  if (parts[0] === 'checkout') return '/cart';
  return '/';
}

// Системная кнопка «Назад» в шапке Telegram (на Android её же вызывает системная «назад»).
function useTelegramBackButton(pathname: string) {
  const navigate = useNavigate();
  useEffect(() => {
    if (ROOT_PATHS.has(pathname) || pathname.startsWith('/admin')) return;
    return showBackButton(() => {
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (idx <= 0) {
        navigate(parentPath(pathname), { replace: true });
        return;
      }
      // Шаг назад по истории; если WebView Telegram его не отработал (экран не сменился) —
      // уходим на уровень выше по адресу (каталог: …/iPhone 18/Duo → …/iPhone 18 → …). Роман, 25.10.2026.
      const before = window.location.pathname;
      navigate(-1);
      window.setTimeout(() => {
        if (window.location.pathname === before) navigate(parentPath(before), { replace: true });
      }, 350);
    });
  }, [pathname, navigate]);
}

function Layout() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');
  useTelegramBackButton(pathname);

  return (
    <>
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/catalog" element={<CatalogScreen />} />
          <Route path="/catalog/:category" element={<CategoryModelsScreen />} />
          <Route path="/catalog/:category/:gen" element={<CategoryModelsScreen />} />
          <Route path="/catalog/:category/:gen/:line" element={<CategoryModelsScreen />} />
          <Route path="/product/:id" element={<ProductDetailScreen />} />
          <Route path="/variant/:variantId" element={<SkuVariantScreen />} />
          <Route path="/cart" element={<CartScreen />} />
          <Route path="/checkout" element={<CheckoutScreen />} />
          <Route path="/result" element={<OrderResultScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/admin/*" element={<AdminScreen />} />
        </Routes>
      </Suspense>
      {!isAdmin && <BottomNav />}
    </>
  );
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}
