import { Component, type ReactNode } from 'react';
import './ErrorBoundary.css';

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

    return (
      <div className="page error-boundary">
        <h2>Что-то пошло не так</h2>
        <p>Попробуйте открыть магазин заново. Если не поможет — напишите менеджеру.</p>
        <button className="btn btn-primary" onClick={this.handleReload}>
          Открыть заново
        </button>
      </div>
    );
  }
}
