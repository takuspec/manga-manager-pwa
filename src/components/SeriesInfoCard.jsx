import ImageView from './ImageView'
import IssueLabel from './IssueLabel'
import {
  formatIssueSpanPeriod,
  getEstimatedLatestIssueInfo,
  getIssueSpanCount,
  getSeriesPublicationPaceLabel
} from '../utils/issueUtils'
import { getHartaGroupLabel } from '../utils/hartaGroups'
import {
  buildAuthorSearchParam,
  getSeriesAuthorNames
} from '../utils/authorUtils'

function SeriesInfoCard({
  series,
  magazineList,
  navigate,
  onClose
}) {
  if (!series) {
    return null
  }

  const magazine =
    magazineList.find((item) => {
      return item.id === series.magazineId
    }) || null

  const authorSearchParam =
    buildAuthorSearchParam(series)
  const authorNames =
    getSeriesAuthorNames(series)

  const getSeriesEndIssueInfo = () => {
    if (
      Number(series.completedIssueYear) &&
      Number(series.completedIssue)
    ) {
      return {
        year: Number(series.completedIssueYear),
        issue: Number(series.completedIssue)
      }
    }

    if (
      (
        series.status === 'completed' ||
        series.status === 'paused'
      ) &&
      Number(series.issueYear) &&
      Number(series.issue)
    ) {
      return {
        year: Number(series.issueYear),
        issue: Number(series.issue)
      }
    }

    return getEstimatedLatestIssueInfo(magazine)
  }

  const getSeriesPeriodText = () => {
    const hasStart =
      Number(series.startIssueYear) &&
      Number(series.startIssue)
    const endIssueInfo =
      getSeriesEndIssueInfo()

    if (
      !magazine ||
      !hasStart ||
      !Number(endIssueInfo?.year) ||
      !Number(endIssueInfo?.issue)
    ) {
      return '期間未設定'
    }

    const spanCount =
      getIssueSpanCount(
        magazine,
        Number(series.startIssueYear),
        Number(series.startIssue),
        Number(endIssueInfo.year),
        Number(endIssueInfo.issue)
      )

    return formatIssueSpanPeriod(
      magazine,
      spanCount,
      Number(series.startIssueYear)
    )
  }

  const getSeriesAuthorText = () => {
    const author =
      series.author?.trim?.() || ''
    const roleAuthors = [
      series.storyAuthor
        ? {
            label: '原作',
            value: series.storyAuthor
          }
        : null,
      series.artAuthor
        ? {
            label: '作画',
            value: series.artAuthor
          }
        : null,
      series.scriptAuthor
        ? {
            label: '脚本',
            value: series.scriptAuthor
          }
        : null
    ].filter(Boolean)

    if (!author && !roleAuthors.length) {
      return <span>未登録</span>
    }

    if (!roleAuthors.length) {
      return <span>{author}</span>
    }

    return (
      <>
        {author && (
          <span className="timeline-series-author-line">
            {author}
          </span>
        )}

        {roleAuthors.map((item) => (
          <span
            className="timeline-series-author-line"
            key={`${item.label}-${item.value}`}
          >
            <span className="timeline-series-author-role">
              {item.label}：
            </span>

            <span>{item.value}</span>
          </span>
        ))}
      </>
    )
  }

  const getSeriesStatusText = () => {
    if (series.status === 'completed') {
      return '完結'
    }

    if (series.status === 'paused') {
      return '休載中'
    }

    return '連載中'
  }

  const renderSeriesIssueRange = () => {
    const hasStart =
      Number(series.startIssueYear) &&
      Number(series.startIssue)

    return (
      <>
        {hasStart ? (
          <IssueLabel
            magazine={magazine}
            year={Number(series.startIssueYear)}
            issue={Number(series.startIssue)}
          />
        ) : (
          <span>開始号未設定</span>
        )}

        <span className="timeline-period-separator">
          -
        </span>

        {Number(series.completedIssueYear) &&
        Number(series.completedIssue) ? (
          <IssueLabel
            magazine={magazine}
            year={Number(series.completedIssueYear)}
            issue={Number(series.completedIssue)}
          />
        ) : (
          <span>連載中</span>
        )}
      </>
    )
  }

  const renderSeriesReadIssue = () => {
    if (
      !Number(series.issueYear) ||
      !Number(series.issue)
    ) {
      return <span>未読</span>
    }

    return (
      <IssueLabel
        magazine={magazine}
        year={Number(series.issueYear)}
        issue={Number(series.issue)}
      />
    )
  }

  const openAuthorSeries = () => {
    if (!authorSearchParam) {
      return
    }

    onClose?.()

    if (authorNames.length > 1) {
      navigate(`/authors/select/${series.id}`)
      return
    }

    navigate(
      `/authors?q=${encodeURIComponent(
        authorSearchParam
      )}`
    )
  }

  return (
    <div
      className="timeline-series-card-backdrop"
      onClick={onClose}
    >
      <div
        className="timeline-series-card"
        onClick={(event) => {
          event.stopPropagation()
        }}
      >
        <div className="timeline-series-card-cover">
          <ImageView
            imageId={series.imageId}
            fallbackImage={series.image}
          />
        </div>

        <div className="timeline-series-card-main">
          <div className="timeline-series-card-title">
            {series.title}
          </div>

          <div className="timeline-series-card-magazine">
            {magazine?.name || '雑誌なし'}
          </div>

          <div className="timeline-series-card-row timeline-series-card-row-wide timeline-series-author-row">
            <div className="timeline-series-author-header">
              <span>作者</span>

              {authorSearchParam && (
                <button
                  type="button"
                  className="timeline-series-author-button"
                  onClick={openAuthorSeries}
                >
                  同作者作品
                </button>
              )}
            </div>

            <strong>
              {getSeriesAuthorText()}
            </strong>
          </div>

          <div className="timeline-series-card-row">
            <span>掲載範囲</span>

            <strong>
              {renderSeriesIssueRange()}
            </strong>
          </div>

          <div className="timeline-series-card-row">
            <span>連載期間</span>

            <strong>
              {getSeriesPeriodText()}
            </strong>
          </div>

          <div className="timeline-series-card-row">
            <span>状態</span>

            <strong>
              {getSeriesStatusText()}
            </strong>
          </div>

          <div className="timeline-series-card-row">
            <span>読了号</span>

            <strong>
              {renderSeriesReadIssue()}
            </strong>
          </div>

          {magazine?.frequency === 'weekly' && (
            <div className="timeline-series-card-row">
              <span>掲載ペース</span>

              <strong>
                {getSeriesPublicationPaceLabel(
                  series.publicationPace
                )}
              </strong>
            </div>
          )}

          {magazine?.frequency === 'harta' && (
            <div className="timeline-series-card-row">
              <span>掲載区分</span>

              <strong>
                {getHartaGroupLabel(series.hartaGroup)}
              </strong>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SeriesInfoCard
