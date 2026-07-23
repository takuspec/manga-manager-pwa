import ImageView from '../components/ImageView'
import {
  getUniqueSeriesAuthorEntries
} from '../utils/authorUtils'

function AuthorSelectPage({
  seriesList,
  navigate,
  useParams
}) {
  const params = useParams()
  const seriesId =
    Number(params.seriesId)
  const series =
    seriesList.find((item) => item.id === seriesId)

  if (!series) {
    return (
      <div className="app">
        <button
          className="back-button"
          type="button"
          onClick={() => navigate(-1)}
        >
          ← 戻る
        </button>

        <div className="title">
          作品が見つかりません
        </div>
      </div>
    )
  }

  const authorEntries =
    getUniqueSeriesAuthorEntries(series)

  return (
    <div className="app">
      <div className="completed-header-sticky author-header-sticky">
        <div className="series-page-header">
          <button
            className="back-button"
            type="button"
            onClick={() => navigate(-1)}
          >
            ← 戻る
          </button>

          <div className="title series-page-title">
            作者を選択
          </div>

          <div />
        </div>
      </div>

      <div className="author-select-source">
        <div className="series-cover-small">
          <ImageView
            imageId={series.imageId}
            fallbackImage={series.image}
          />
        </div>

        <div className="author-select-source-info">
          <div className="series-title">
            {series.title}
          </div>

          <div className="author-result-count">
            同作者の作品を見たい作者を選んでください
          </div>
        </div>
      </div>

      <div className="author-select-list">
        {authorEntries.map((entry) => (
          <button
            type="button"
            className="author-select-button"
            key={`${entry.role}-${entry.name}`}
            onClick={() =>
              navigate(
                `/authors?q=${encodeURIComponent(
                  entry.name
                )}`
              )
            }
          >
            {entry.role && (
              <span className="author-select-role">
                {entry.role}
              </span>
            )}

            <span>
              {entry.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default AuthorSelectPage
