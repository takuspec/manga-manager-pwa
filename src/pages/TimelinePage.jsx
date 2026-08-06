import {
  useRef,
  useState
} from 'react'
import { useParams } from 'react-router-dom'
import ImageView from '../components/ImageView'
import IssueLabel from '../components/IssueLabel'
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

const magazineAllValue = 'all'

const timelineViewOptions = [
  {
    value: 'list',
    label: 'リスト'
  },
  {
    value: 'grid',
    label: 'グリッド'
  }
]

const timelineViewLabelMap = {
  list: 'リスト',
  grid: 'グリッド'
}

const timelineGridScaleStorageKey =
  'manga-manager-timeline-grid-scale'
const defaultTimelineGridScale = 1

const clampTimelineGridScale = (value) => {
  return Math.min(
    1.35,
    Math.max(0.75, value)
  )
}

const getTouchDistance = (touches) => {
  const [first, second] = touches
  const diffX =
    first.clientX - second.clientX
  const diffY =
    first.clientY - second.clientY

  return Math.sqrt(diffX * diffX + diffY * diffY)
}

function TimelinePage({
  magazineList,
  seriesList,
  navigate
}) {
  const params = useParams()
  const selectedMagazineId =
    params.magazineId || magazineAllValue
  const isAllMagazines =
    selectedMagazineId === magazineAllValue
  const magazineId =
    Number(selectedMagazineId)

  const [
    timelineViewMode,
    setTimelineViewMode
  ] = useState('grid')

  const [
    timelineGridScale,
    setTimelineGridScale
  ] = useState(() => {
    const savedValue =
      Number(
        localStorage.getItem(
          timelineGridScaleStorageKey
        )
      )

    if (!savedValue) {
      return defaultTimelineGridScale
    }

    return clampTimelineGridScale(savedValue)
  })

  const pinchStartDistanceRef = useRef(0)
  const pinchStartScaleRef = useRef(1)
  const timelineGridScaleRef = useRef(
    timelineGridScale
  )

  const [
    isViewModeMenuOpen,
    setIsViewModeMenuOpen
  ] = useState(false)

  const [
    isMagazineMenuOpen,
    setIsMagazineMenuOpen
  ] = useState(false)

  const [
    selectedTimelineSeries,
    setSelectedTimelineSeries
  ] = useState(null)

  const getSeriesMagazine = (series) =>
    magazineList.find(
      (magazine) =>
        magazine.id === series.magazineId
    )

  const selectedMagazine =
    isAllMagazines
      ? null
      : magazineList.find(
          (magazine) =>
            magazine.id === magazineId
        )

  const selectedMagazineLabel =
    isAllMagazines
      ? '全雑誌'
      : selectedMagazine?.name || '雑誌なし'

  const magazineOptions = [
    {
      value: magazineAllValue,
      label: '全雑誌'
    },
    ...magazineList.map((magazine) => ({
      value: String(magazine.id),
      label: magazine.name
    }))
  ]

  const timelineEvents =
    seriesList
      .filter((series) => {
        if (isAllMagazines) {
          return true
        }

        return series.magazineId === magazineId
      })
      .flatMap((series) => {
        const magazine =
          getSeriesMagazine(series)
        const events = []

        if (
          Number(series.startIssueYear) &&
          Number(series.startIssue)
        ) {
          events.push({
            type: 'start',
            label: '開始',
            year: Number(series.startIssueYear),
            issue: Number(series.startIssue),
            series,
            magazine
          })
        }

        if (
          Number(series.completedIssueYear) &&
          Number(series.completedIssue)
        ) {
          events.push({
            type: 'end',
            label: '終了',
            year: Number(series.completedIssueYear),
            issue: Number(series.completedIssue),
            series,
            magazine
          })
        }

        return events
      })
      .sort((a, b) => {
        const issueResult =
          a.year * 100 +
          a.issue -
          (b.year * 100 + b.issue)

        if (issueResult !== 0) {
          return issueResult
        }

        if (a.type !== b.type) {
          return a.type === 'start' ? -1 : 1
        }

        return (a.series.title || '').localeCompare(
          b.series.title || '',
          'ja'
        )
      })

  const groupedEvents =
    timelineEvents.reduce((groups, event) => {
      const lastGroup =
        groups[groups.length - 1]

      if (!lastGroup || lastGroup.year !== event.year) {
        groups.push({
          year: event.year,
          events: [event]
        })
      } else {
        lastGroup.events.push(event)
      }

      return groups
    }, [])

  const groupEventsByIssue = (events) => {
    return events.reduce((groups, event) => {
      const issueKey =
        `${event.year}-${event.issue}`
      const lastGroup =
        groups[groups.length - 1]

      if (
        !lastGroup ||
        lastGroup.issueKey !== issueKey
      ) {
        groups.push({
          issueKey,
          year: event.year,
          issue: event.issue,
          magazine: event.magazine,
          events: [event]
        })
      } else {
        lastGroup.events.push(event)
      }

      return groups
    }, [])
  }

  const getSeriesEndIssueInfo = (series) => {
    if (
      Number(series.completedIssueYear) &&
      Number(series.completedIssue)
    ) {
      return {
        year: Number(series.completedIssueYear),
        issue: Number(series.completedIssue),
        label: null
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
        issue: Number(series.issue),
        label: null
      }
    }

    const magazine =
      getSeriesMagazine(series)
    const latestIssueInfo =
      magazine
        ? getEstimatedLatestIssueInfo(magazine)
        : null

    return {
      year: latestIssueInfo?.year || null,
      issue: latestIssueInfo?.issue || null,
      label: null
    }
  }

  const getSeriesPeriodText = (
    series,
    magazine
  ) => {
    const hasStart =
      Number(series.startIssueYear) &&
      Number(series.startIssue)
    const endIssueInfo =
      getSeriesEndIssueInfo(series)

    if (
      !magazine ||
      !hasStart ||
      !Number(endIssueInfo.year) ||
      !Number(endIssueInfo.issue)
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

  const getSeriesAuthorText = (series) => {
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

  const getSeriesStatusText = (series) => {
    if (series.status === 'completed') {
      return '完結'
    }

    if (series.status === 'paused') {
      return '休載中'
    }

    return '連載中'
  }

  const renderSeriesReadIssue = (
    series,
    magazine
  ) => {
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

  const renderSeriesIssueRange = (
    series,
    magazine
  ) => {
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

  const selectedTimelineMagazine =
    selectedTimelineSeries
      ? getSeriesMagazine(selectedTimelineSeries)
      : null
  const selectedTimelineAuthorSearchParam =
    selectedTimelineSeries
      ? buildAuthorSearchParam(
          selectedTimelineSeries
        )
      : ''
  const selectedTimelineAuthorNames =
    selectedTimelineSeries
      ? getSeriesAuthorNames(
          selectedTimelineSeries
        )
      : []

  const closeTimelineSeriesCard = () => {
    setSelectedTimelineSeries(null)
  }

  const openAuthorSeries = () => {
    if (
      !selectedTimelineSeries ||
      !selectedTimelineAuthorSearchParam
    ) {
      return
    }

    closeTimelineSeriesCard()

    if (selectedTimelineAuthorNames.length > 1) {
      navigate(
        `/authors/select/${selectedTimelineSeries.id}`
      )
      return
    }

    navigate(
      `/authors?q=${encodeURIComponent(
        selectedTimelineAuthorSearchParam
      )}`
    )
  }

  const closeMenus = () => {
    setIsViewModeMenuOpen(false)
    setIsMagazineMenuOpen(false)
  }

  const saveTimelineGridScale = (scale) => {
    localStorage.setItem(
      timelineGridScaleStorageKey,
      String(scale)
    )
  }

  const handleTimelineTouchStart = (event) => {
    if (
      timelineViewMode !== 'grid' ||
      event.touches.length !== 2
    ) {
      return
    }

    pinchStartDistanceRef.current =
      getTouchDistance(event.touches)
    pinchStartScaleRef.current =
      timelineGridScale
  }

  const handleTimelineTouchMove = (event) => {
    if (
      timelineViewMode !== 'grid' ||
      event.touches.length !== 2 ||
      !pinchStartDistanceRef.current
    ) {
      return
    }

    event.preventDefault()

    const currentDistance =
      getTouchDistance(event.touches)
    const nextScale =
      clampTimelineGridScale(
        pinchStartScaleRef.current *
          (currentDistance /
            pinchStartDistanceRef.current)
      )

    setTimelineGridScale(nextScale)
    timelineGridScaleRef.current = nextScale
  }

  const handleTimelineTouchEnd = () => {
    if (!pinchStartDistanceRef.current) {
      return
    }

    pinchStartDistanceRef.current = 0
    saveTimelineGridScale(
      timelineGridScaleRef.current
    )
  }

  return (
    <div className="app">
      <div className="completed-header-sticky timeline-header-sticky">
        <div className="series-page-header">
          <button
            className="back-button"
            type="button"
            onClick={() => navigate('/timeline')}
          >
            ← 戻る
          </button>

          <div className="title series-page-title">
            年表
          </div>

          <div />
        </div>

        <div className="timeline-current-scope">
          {selectedMagazineLabel}
        </div>
      </div>

      <div
        className={`timeline-list ${
          timelineViewMode === 'grid'
            ? 'timeline-list-grid'
            : ''
        }`}
        style={{
          '--timeline-grid-scale':
            timelineGridScale
        }}
        onTouchStart={handleTimelineTouchStart}
        onTouchMove={handleTimelineTouchMove}
        onTouchEnd={handleTimelineTouchEnd}
        onTouchCancel={handleTimelineTouchEnd}
      >
        {groupedEvents.map((group) => (
          <section
            className="timeline-year-section"
            key={group.year}
          >
            <div className="timeline-year-heading">
              {group.year}年
            </div>

            <div className="timeline-year-events">
              {groupEventsByIssue(group.events).map(
                (issueGroup) => (
                  <div
                    className="timeline-issue-group"
                    key={issueGroup.issueKey}
                  >
                    {timelineViewMode === 'grid' && (
                      <div className="timeline-issue-heading">
                        {issueGroup.issue}号
                      </div>
                    )}

                    <div className="timeline-issue-events">
                      {issueGroup.events.map((event) => (
                        <button
                          type="button"
                          className={`timeline-event-card timeline-event-${event.type}`}
                          key={`${event.type}-${event.series.id}-${event.year}-${event.issue}`}
                          onClick={() => {
                            setSelectedTimelineSeries(
                              event.series
                            )
                          }}
                        >
                          <div className="timeline-event-cover">
                            <ImageView
                              imageId={event.series.imageId}
                              fallbackImage={event.series.image}
                            />
                          </div>

                          <div className="timeline-event-main">
                            <div className="timeline-event-top">
                              <span className="timeline-event-type">
                                {event.label}
                              </span>

                              <span className="timeline-event-issue">
                                <IssueLabel
                                  magazine={event.magazine}
                                  year={event.year}
                                  issue={event.issue}
                                />
                              </span>
                            </div>

                            <div className="timeline-event-title">
                              {event.series.title}
                            </div>

                            <div className="timeline-event-period">
                              <span className="timeline-event-period-label">
                                掲載範囲
                              </span>

                              {renderSeriesIssueRange(
                                event.series,
                                event.magazine
                              )}
                            </div>

                            <div className="timeline-event-period">
                              <span className="timeline-event-period-label">
                                期間
                              </span>

                              <span>
                                {getSeriesPeriodText(
                                  event.series,
                                  event.magazine
                                )}
                              </span>
                            </div>

                            {isAllMagazines && (
                              <div className="timeline-event-magazine">
                                {event.magazine?.name ||
                                  '雑誌なし'}
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        ))}
      </div>

      {selectedTimelineSeries && (
        <div
          className="timeline-series-card-backdrop"
          onClick={closeTimelineSeriesCard}
        >
          <div
            className="timeline-series-card"
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            <div className="timeline-series-card-cover">
              <ImageView
                imageId={selectedTimelineSeries.imageId}
                fallbackImage={
                  selectedTimelineSeries.image
                }
              />
            </div>

            <div className="timeline-series-card-main">
              <div className="timeline-series-card-title">
                {selectedTimelineSeries.title}
              </div>

              <div className="timeline-series-card-magazine">
                {selectedTimelineMagazine?.name ||
                  '雑誌なし'}
              </div>

              <div className="timeline-series-card-row timeline-series-card-row-wide timeline-series-author-row">
                <div className="timeline-series-author-header">
                  <span>作者</span>

                  {selectedTimelineAuthorSearchParam && (
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
                  {getSeriesAuthorText(
                    selectedTimelineSeries
                  )}
                </strong>
              </div>

              <div className="timeline-series-card-row">
                <span>掲載範囲</span>

                <strong>
                  {renderSeriesIssueRange(
                    selectedTimelineSeries,
                    selectedTimelineMagazine
                  )}
                </strong>
              </div>

              <div className="timeline-series-card-row">
                <span>連載期間</span>

                <strong>
                  {getSeriesPeriodText(
                    selectedTimelineSeries,
                    selectedTimelineMagazine
                  )}
                </strong>
              </div>

              <div className="timeline-series-card-row">
                <span>状態</span>

                <strong>
                  {getSeriesStatusText(
                    selectedTimelineSeries
                  )}
                </strong>
              </div>

              <div className="timeline-series-card-row">
                <span>読了号</span>

                <strong>
                  {renderSeriesReadIssue(
                    selectedTimelineSeries,
                    selectedTimelineMagazine
                  )}
                </strong>
              </div>

              {selectedTimelineMagazine?.frequency ===
                'weekly' && (
                <div className="timeline-series-card-row">
                  <span>掲載ペース</span>

                  <strong>
                    {getSeriesPublicationPaceLabel(
                      selectedTimelineSeries.publicationPace
                    )}
                  </strong>
                </div>
              )}

              {selectedTimelineMagazine?.frequency ===
                'harta' && (
                <div className="timeline-series-card-row">
                  <span>掲載区分</span>

                  <strong>
                    {getHartaGroupLabel(
                      selectedTimelineSeries.hartaGroup
                    )}
                  </strong>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {(isViewModeMenuOpen ||
        isMagazineMenuOpen) && (
        <div
          className="view-mode-menu-backdrop"
          onClick={closeMenus}
        />
      )}

      <div className="bottom-nav series-bottom-nav timeline-footer">
        <div
          className="view-mode-selector timeline-view-selector"
          onClick={(e) =>
            e.stopPropagation()
          }
        >
          {isViewModeMenuOpen && (
            <div
              className="view-mode-menu"
              onClick={(e) =>
                e.stopPropagation()
              }
            >
              {timelineViewOptions.map((option) => {
                const isSelected =
                  timelineViewMode === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`view-mode-menu-item ${
                      isSelected ? 'active' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setTimelineViewMode(option.value)
                      setIsViewModeMenuOpen(false)
                    }}
                  >
                    <span className="view-mode-check">
                      {isSelected ? '✓' : ''}
                    </span>

                    <span>
                      {option.label}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <button
            type="button"
            className="view-mode-button"
            onClick={() => {
              setIsMagazineMenuOpen(false)
              setIsViewModeMenuOpen(
                (isOpen) => !isOpen
              )
            }}
          >
            {timelineViewLabelMap[timelineViewMode]}
            {' '}
            {isViewModeMenuOpen
              ? '▲'
              : '▼'}
          </button>
        </div>

        <div
          className="view-mode-selector timeline-magazine-selector"
          onClick={(e) =>
            e.stopPropagation()
          }
        >
          {isMagazineMenuOpen && (
            <div
              className="view-mode-menu completed-magazine-menu"
              onClick={(e) =>
                e.stopPropagation()
              }
            >
              {magazineOptions.map((option) => {
                const isSelected =
                  selectedMagazineId === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`view-mode-menu-item ${
                      isSelected ? 'active' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsMagazineMenuOpen(false)
                      navigate(
                        `/timeline/${option.value}`,
                        { replace: true }
                      )
                    }}
                  >
                    <span className="view-mode-check">
                      {isSelected ? '✓' : ''}
                    </span>

                    <span>
                      {option.label}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <button
            type="button"
            className="view-mode-button"
            onClick={() => {
              setIsViewModeMenuOpen(false)
              setIsMagazineMenuOpen(
                (isOpen) => !isOpen
              )
            }}
          >
            {selectedMagazineLabel}
            {' '}
            {isMagazineMenuOpen
              ? '▲'
              : '▼'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default TimelinePage
