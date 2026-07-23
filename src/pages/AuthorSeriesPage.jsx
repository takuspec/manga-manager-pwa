import { useSearchParams } from 'react-router-dom'
import ImageView from '../components/ImageView'
import IssueLabel from '../components/IssueLabel'
import {
  formatIssueSpanPeriod,
  getEstimatedLatestIssueInfo,
  getIssueSpanCount
} from '../utils/issueUtils'
import {
  formatSeriesAuthorEntries,
  getSeriesAuthorNames,
  seriesMatchesAuthorParam
} from '../utils/authorUtils'

function AuthorSeriesPage({
  magazineList,
  seriesList,
  navigate
}) {
  const [searchParams] = useSearchParams()
  const authorParam =
    searchParams.get('q') || ''

  const selectedAuthors =
    authorParam
      .split('|')
      .map((name) => name.trim())
      .filter(Boolean)

  const getSeriesMagazine = (series) =>
    magazineList.find(
      (magazine) =>
        magazine.id === series.magazineId
    )

  const filteredSeries =
    seriesList
      .filter((series) => {
        if (authorParam) {
          return seriesMatchesAuthorParam(
            series,
            authorParam
          )
        }

        return getSeriesAuthorNames(series).length > 0
      })
      .sort((a, b) => {
        const startResult =
          (a.startIssueYear || 0) * 100 +
          (a.startIssue || 0) -
          ((b.startIssueYear || 0) * 100 +
            (b.startIssue || 0))

        if (startResult !== 0) {
          return startResult
        }

        return (a.title || '').localeCompare(
          b.title || '',
          'ja'
        )
      })

  const title =
    selectedAuthors.length > 0
      ? `全雑誌: ${selectedAuthors.join(' / ')}`
      : '全雑誌の作者検索'

  const renderCompletedIssue = (
    series,
    magazine
  ) => {
    if (!Number(series.completedIssue)) {
      return '連載中'
    }

    return (
      <IssueLabel
        magazine={magazine}
        year={series.completedIssueYear}
        issue={series.completedIssue}
      />
    )
  }

  const formatSeriesPeriod = (
    series,
    magazine
  ) => {
    if (
      !magazine ||
      !Number(series.startIssue)
    ) {
      return ''
    }

    const isCompleted =
      Number(series.completedIssue) > 0
    const latestIssue =
      isCompleted
        ? null
        : getEstimatedLatestIssueInfo(magazine)
    const endIssueYear =
      isCompleted
        ? Number(series.completedIssueYear) ||
          Number(series.issueYear) ||
          Number(series.startIssueYear)
        : Number(latestIssue?.year) ||
          Number(series.issueYear) ||
          Number(series.startIssueYear)
    const endIssue =
      isCompleted
        ? Number(series.completedIssue)
        : Number(latestIssue?.issue) ||
          Number(series.issue) ||
          Number(series.startIssue)

    if (!endIssueYear || !endIssue) {
      return ''
    }

    const issueCount =
      getIssueSpanCount(
        magazine,
        Number(series.startIssueYear) ||
          Number(series.issueYear) ||
          new Date().getFullYear(),
        Number(series.startIssue),
        endIssueYear,
        endIssue
      )

    return formatIssueSpanPeriod(
      magazine,
      issueCount,
      series.startIssueYear
    )
  }

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
            {title}
          </div>

          <div />
        </div>

      </div>

      <div className="author-result-count">
        全雑誌から{filteredSeries.length}作品
      </div>

      <div className="completed-series-list author-series-list">
        {filteredSeries.map((series) => {
          const magazine =
            getSeriesMagazine(series)
          const authorLabel =
            formatSeriesAuthorEntries(series)
          const periodLabel =
            formatSeriesPeriod(series, magazine)

          return (
            <button
              type="button"
              className="completed-series-list-card author-series-card"
              key={series.id}
              onClick={() =>
                navigate(`/series/${series.id}`)
              }
            >
              <div className="series-cover-small">
                <ImageView
                  imageId={series.imageId}
                  fallbackImage={series.image}
                />
              </div>

              <div className="completed-series-info">
                <div className="series-title">
                  {series.title}
                </div>

                {authorLabel && (
                  <div className="author-series-author">
                    {authorLabel}
                  </div>
                )}

                <div className="author-series-meta">
                  <span>
                    {magazine?.name || '雑誌なし'}
                  </span>

                  <span>
                    開始:{' '}
                    <IssueLabel
                      magazine={magazine}
                      year={series.startIssueYear}
                      issue={series.startIssue}
                    />
                  </span>

                  <span>
                    終了:{' '}
                    {renderCompletedIssue(
                      series,
                      magazine
                    )}
                  </span>

                  {periodLabel && (
                    <span className="author-series-period">
                      期間: {periodLabel}
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default AuthorSeriesPage
