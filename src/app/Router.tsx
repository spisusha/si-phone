import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import HomeScreen from '../screens/HomeScreen';
import CatalogScreen from '../screens/CatalogScreen';
import CategoryModelsScreen from '../screens/CategoryModelsScreen';
import FamilyProductsScreen from '../screens/FamilyProductsScreen';
import ProductListScreen from '../screens/ProductListScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import SkuVariantScreen from '../screens/WatchVariantScreen';
import CartScreen from '../screens/CartScreen';
import CheckoutScreen from '../screens/CheckoutScreen';
import OrderResultScreen from '../screens/OrderResultScreen';
import ProfileScreen from '../screens/ProfileScreen';
import Loader from '../components/Loader';

// Админка (и библиотека Excel внутри неё) грузится отдельно — покупатель её не скачивает.
const AdminScreen = lazy(() => import('../screens/AdminScreen'));

function Layout() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');

  return (
    <>
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/catalog" element={<CatalogScreen />} />
          <Route path="/catalog/:category" element={<CategoryModelsScreen />} />
          <Route path="/catalog/:category/:familyId" element={<FamilyProductsScreen />} />
          <Route path="/products" element={<ProductListScreen />} />
          <Route path="/product/:id" element={<ProductDetailScreen />} />
          <Route path="/variant/:variantId" element={<SkuVariantScreen />} />
          <Route path="/cart" element={<CartScreen />} />
          <Route path="/checkout" element={<CheckoutScreen />} />
          <Route path="/result" element={<OrderResultScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/admin" element={<AdminScreen />} />
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
