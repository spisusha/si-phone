import { Component, type ReactNode } from 'react';
import EmptyState from './EmptyState';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Страховка: любая ошибка в экране показывает понятное сообщение вместо белого экрана.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('UI error', error);
  }

  handleReload = () => {
    window.location.assign('/');
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return <EmptyState kind="crash" action={{ label: 'Открыть заново', onClick: this.handleReload }} manager />;
  }
}
