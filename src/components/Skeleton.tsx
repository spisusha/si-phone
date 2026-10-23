import './Skeleton.css';

// Серые заготовки в форме настоящих карточек — пока каталог грузится.
// Форма совпадает с карточкой, поэтому после загрузки экран не прыгает.

export function ProductGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="page" aria-busy="true" aria-label="Загрузка">
      <div className="sk sk-title" />
      <div className="sk-chips">
        {[64, 88, 72, 96].map((w, i) => <div key={i} className="sk sk-chip" style={{ width: w }} />)}
      </div>
      <div className="product-grid">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="sk-card">
            <div className="sk sk-card__img" />
            <div className="sk-card__info">
              <div className="sk sk-line" />
              <div className="sk sk-line sk-line--short" />
              <div className="sk sk-line sk-line--price" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="page" aria-busy="true" aria-label="Загрузка">
      <div className="sk sk-title" />
      <div className="sk-list">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="sk-row">
            <div className="sk sk-row__icon" />
            <div className="sk sk-line sk-row__text" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Загрузка">
      <div className="sk sk-gallery" />
      <div className="sk sk-line sk-line--title" />
      <div className="sk sk-line sk-line--short" />
      <div className="sk sk-line sk-line--price" />
      <div className="sk sk-button" />
    </div>
  );
}
