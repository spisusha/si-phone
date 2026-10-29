import { useNavigate } from 'react-router-dom';
import { hasNativeBackButton, openTelegramChat } from '../telegram/telegramWebApp';
import { reviewDate, reviewPhotoUrl, useReviews, type ShopReview } from '../api/reviewsRepo';
import Loader from '../components/Loader';
import './ReviewsScreen.css';

// Отзывы покупателей (/reviews) — открываются из профиля. Те же отзывы, что в боте:
// комментарии под постом в канале, у каждого — ссылка на сам комментарий, чтобы было видно,
// что писал человек, а не магазин.

export default function ReviewsScreen() {
  const navigate = useNavigate();
  const nativeBack = hasNativeBackButton();
  const data = useReviews();

  return (
    <div className="page reviews">
      {!nativeBack && (
        <button className="legal__back" onClick={() => navigate(-1)} aria-label="Назад">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
      )}
      <h1 className="page-title">Отзывы</h1>

      {data === undefined && <Loader />}
      {data === null && (
        <p className="reviews__lead">Не получилось загрузить отзывы. Проверьте интернет и откройте страницу ещё раз.</p>
      )}
      {data && (
        <>
          <p className="reviews__lead">
            Из комментариев в нашем Telegram-канале — их пишут сами покупатели.
            {data.all && <> <button className="reviews__link" onClick={() => openTelegramChat(data.all!)}>Открыть в Telegram</button></>}
          </p>
          {data.reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
        </>
      )}
    </div>
  );
}

function ReviewCard({ review: r }: { review: ShopReview }) {
  return (
    <article className="review">
      <header className="review__head">
        <span className="review__avatar" aria-hidden="true">{r.name[0].toUpperCase()}</span>
        <span>
          {/* bdi — имя на иврите или арабском не переворачивает дату рядом */}
          <span className="review__name"><bdi>{r.name}</bdi></span>
          {r.date && <span className="review__date">{reviewDate(r.date)}</span>}
        </span>
      </header>
      <p className="review__text">{r.text}</p>
      {r.photos > 0 && (
        <div className={`review__photos${r.photos > 1 ? ' review__photos--grid' : ''}`}>
          {Array.from({ length: r.photos }, (_, n) => (
            <img key={n} src={reviewPhotoUrl(r.id, n)} alt="Фото покупателя к отзыву" loading="lazy" />
          ))}
        </div>
      )}
      {r.link && (
        <button className="reviews__link" onClick={() => openTelegramChat(r.link!)}>Посмотреть в Telegram ›</button>
      )}
    </article>
  );
}
