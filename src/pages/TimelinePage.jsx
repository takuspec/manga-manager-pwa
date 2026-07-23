import {
  useRef,
  useState
} from 'react'
import { useParams } from 'react-router-dom'
import ImageView from '../components/ImageView'
import IssueLabel from '../components/IssueLabel'

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
                          onClick={() =>
                            navigate(
                              `/series/${event.series.id}`
                            )
                          }
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
