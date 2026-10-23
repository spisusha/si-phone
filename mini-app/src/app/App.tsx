import AppRouter from './Router';
import ErrorBoundary from '../components/ErrorBoundary';
import '../styles/globals.css';

export default function App() {
  return (
    <ErrorBoundary>
      <AppRouter />
    </ErrorBoundary>
  );
}
