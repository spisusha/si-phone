import { useEffect } from 'react';
import AppRouter from './Router';
import ErrorBoundary from '../components/ErrorBoundary';
import { initTelegram } from '../telegram/telegramWebApp';
import '../styles/globals.css';

export default function App() {
  useEffect(() => {
    initTelegram();
  }, []);

  return (
    <ErrorBoundary>
      <AppRouter />
    </ErrorBoundary>
  );
}
