import { useState } from 'react'
import { useParams } from 'react-router-dom'
import ImageView from '../components/ImageView'
import IssueLabel from '../components/IssueLabel'
import HartaGroupBadge from '../components/HartaGroupBadge'
import SeriesInfoCard from '../components/SeriesInfoCard'
import {
  formatIssueSpanPeriod,
  getIssueSpanCount
} from '../utils/issueUtils'

const completedViewOptions = [
  {
    value: 'grid',
    label: 'グリッド'
  },
  {
    value: 'list',
    label: 'リスト'
  }
]

const completedViewLabelMap = {
  grid: 'グリッド',
  list: 'リスト'
}

function CompletedSeriesPage({
  magazineList,
  seriesList,
  navigate
}) {
  const params = useParams()

  const selectedMagazineId =
    params.magazineId

  const isAllMagazines =
    selectedMagazineId === 'all'

  const magazineId =
    Number(selectedMagazineId)

  const magazine =
    isAllMagazines
      ? null
      : magazineList.find((item) => {
          return item.id === magazineId
        })

  const [sortMode, setSortMode] =
    useState('title')

  const [sortDirection, setSortDirection] =
    useState('asc')

  const [viewMode, setViewMode] =
    useState('grid')

  const [
    selectedInfoSeries,
    setSelectedInfoSeries
  ] = useState(null)

  const [
    isViewModeMenuOpen,
    setIsViewModeMenuOpen
  ] = useState(false)

  const [
    isMagazineMenuOpen,
    setIsMagazineMenuOpen
  ] = useState(false)

  const getSeriesMagazine = (item) => {
    return magazineList.find((magazineItem) => {
      return magazineItem.id === item.magazineId
    })
  }

  const selectedMagazineLabel =
    isAllMagazines
      ? '全雑誌'
      : magazine?.name || '雑誌'

  const magazineOptions = [
    {
      value: 'all',
      label: '全雑誌'
    },
    ...magazineList.map((magazineItem) => {
      return {
        value: String(magazineItem.id),
        label: magazineItem.name
      }
    })
  ]

  const getSeriesPeriodSerial = (
    item,
    targetMagazine
  ) => {
    if (!targetMagazine) {
      return 0
    }

    const startIssue =
      Number(item.startIssue) || 0

    const endIssue =
      Number(item.completedIssue) ||
      Number(item.issue) ||
      0

    if (!startIssue || !endIssue) {
      return 0
    }

    return getIssueSpanCount(
      targetMagazine,
      Number(item.startIssueYear) ||
        Number(item.issueYear) ||
        new Date().getFullYear(),
      startIssue,
      Number(item.completedIssueYear) ||
        Number(item.issueYear) ||
        Number(item.startIssueYear) ||
        new Date().getFullYear(),
      endIssue
    )
  }

  const formatSeriesPeriod = (
    item,
    targetMagazine
  ) => {
    const diff =
      getSeriesPeriodSerial(
        item,
        targetMagazine
      )

    return formatIssueSpanPeriod(
      targetMagazine,
      diff,
      item.startIssueYear
    )
  }

  const renderPeriodBadge = (
    item,
    targetMagazine
  ) => {
    return (
      <div className="series-period-badge completed-period-badge">
        {formatSeriesPeriod(
          item,
          targetMagazine
        )}
      </div>
    )
  }

  if (!isAllMagazines && !magazine) {
    return (
      <div className="app">

        <button
          onClick={() =>
            navigate('/completed')
          }
        >
          ← 戻る
        </button>

        <div className="title">
          雑誌が見つかりません
        </div>

      </div>
    )
  }

  const completedSeries =
    seriesList
      .filter((item) => {
        if (item.status !== 'completed') {
          return false
        }

        if (isAllMagazines) {
          return true
        }

        return item.magazineId === magazineId
      })
      .sort((a, b) => {
        let result = 0

        if (sortMode === 'title') {
          result =
            (a.title || '').localeCompare(
              b.title || '',
              'ja'
            )
        }

        if (sortMode === 'start') {
          const aStart =
            (a.startIssueYear || 0) * 100 +
            (a.startIssue || 0)

          const bStart =
            (b.startIssueYear || 0) * 100 +
            (b.startIssue || 0)

          result = aStart - bStart
        }

        if (sortMode === 'end') {
          const aEnd =
            (a.completedIssueYear || 0) * 100 +
            (a.completedIssue || 0)

          const bEnd =
            (b.completedIssueYear || 0) * 100 +
            (b.completedIssue || 0)

          result = aEnd - bEnd
        }

        if (sortMode === 'duration') {
          result =
            getSeriesPeriodSerial(
              a,
              getSeriesMagazine(a)
            ) -
            getSeriesPeriodSerial(
              b,
              getSeriesMagazine(b)
            )
        }

        return sortDirection === 'asc'
          ? result
          : result * -1
      })

  const renderMagazineName = (item) => {
    if (!isAllMagazines) {
      return null
    }

    const itemMagazine =
      getSeriesMagazine(item)

    return (
      <div className="completed-series-magazine">
        {itemMagazine?.name || '不明な雑誌'}
      </div>
    )
  }

  const renderIssueInfo = (
    item,
    targetMagazine
  ) => {
    const renderEndIssueLabel = () => {
      if (!Number(item.completedIssue)) {
        return (
          <span className="issue-label issue-label-unread">
            ----
          </span>
        )
      }

      return (
        <IssueLabel
          magazine={targetMagazine}
          year={item.completedIssueYear}
          issue={item.completedIssue}
        />
      )
    }

    return (
      <div className="completed-issue-info">
        <div className="completed-issue-row">
          <span className="completed-issue-label">
            開始
          </span>

          <span className="completed-issue-value">
            <IssueLabel
              magazine={targetMagazine}
              year={item.startIssueYear}
              issue={item.startIssue}
            />
          </span>
        </div>

        <div className="completed-issue-row">
          <span className="completed-issue-label">
            終了
          </span>

          <span className="completed-issue-value">
            {renderEndIssueLabel()}
          </span>
        </div>
      </div>
    )
  }

  const renderHartaGroupBadge = (
    item,
    targetMagazine
  ) => {
    if (isAllMagazines) {
      return null
    }

    return (
      <HartaGroupBadge
        magazine={targetMagazine}
        series={item}
      />
    )
  }

  const closeMenus = () => {
    setIsViewModeMenuOpen(false)
    setIsMagazineMenuOpen(false)
  }

  return (
    <div className="app">

      <div className="completed-header-sticky">

      <div className="series-page-header">

        <button
          className="back-button"
          onClick={() =>
            navigate('/completed')
          }
        >
          ← 戻る
        </button>

        <div className="title series-page-title">
          {selectedMagazineLabel}
        </div>

        <div />

      </div>

      <div className="sort-row sort-row-with-button">

        <select
          value={sortMode}
          onChange={(e) =>
            setSortMode(e.target.value)
          }
        >
          <option value="title">
            タイトル順
          </option>

          <option value="start">
            開始号順
          </option>

          <option value="end">
            終了号順
          </option>
          <option value="duration">
            連載期間順
          </option>
        </select>

        <button
          onClick={() =>
            setSortDirection(
              sortDirection === 'asc'
                ? 'desc'
                : 'asc'
            )
          }
        >
          {sortDirection === 'asc'
            ? '昇順'
            : '降順'}
        </button>

      </div>

      </div>

      {viewMode === 'list' ? (
        <div className="completed-series-list">
          {completedSeries.map((item) => {
            const itemMagazine =
              getSeriesMagazine(item)

            return (
              <div
                className="completed-series-list-card"
                key={item.id}
                onClick={() => {
                  setSelectedInfoSeries(item)
                }}
              >
                <div className="series-cover-small">
                  <ImageView
                    imageId={item.imageId}
                    fallbackImage={item.image}
                  />
                </div>

                <div className="completed-series-info">
                  <div className="completed-title-row">
                    <div className="series-title">
                      {item.title}
                    </div>

                    {renderHartaGroupBadge(
                      item,
                      itemMagazine
                    )}
                  </div>

                  {renderMagazineName(item)}

                  {renderIssueInfo(
                    item,
                    itemMagazine
                  )}

                  {renderPeriodBadge(
                    item,
                    itemMagazine
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="grid">

          {completedSeries.map((item) => {
            const itemMagazine =
              getSeriesMagazine(item)

            return (
              <div
                className="card completed-grid-card"
                key={item.id}
                onClick={() => {
                  setSelectedInfoSeries(item)
                }}
              >

                <div className="cover">

                  <ImageView
                    imageId={item.imageId}
                    fallbackImage={item.image}
                  />

                </div>

                <div className="completed-title-row completed-grid-title-row">
                  <div className="card-title">
                    {item.title}
                  </div>

                  {renderHartaGroupBadge(
                    item,
                    itemMagazine
                  )}
                </div>

                {renderMagazineName(item)}

                {renderIssueInfo(
                  item,
                  itemMagazine
                )}

                {renderPeriodBadge(
                  item,
                  itemMagazine
                )}
              </div>
            )
          })}

        </div>
      )}

      {(isViewModeMenuOpen ||
        isMagazineMenuOpen) && (
        <div
          className="view-mode-menu-backdrop"
          onClick={closeMenus}
        />
      )}

      <div className="bottom-nav series-bottom-nav completed-series-footer">
        <div
          className="view-mode-selector completed-view-selector"
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
              {completedViewOptions.map((option) => {
                const isSelected =
                  viewMode === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`view-mode-menu-item ${
                      isSelected ? 'active' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setViewMode(option.value)
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
            {completedViewLabelMap[viewMode]}
            {' '}
            {isViewModeMenuOpen
              ? '▲'
              : '▼'}
          </button>
        </div>

        <div
          className="view-mode-selector completed-magazine-selector"
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
                        `/completed/${option.value}`,
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
            <span className="completed-footer-label">
              {selectedMagazineLabel}
            </span>
            {' '}
            {isMagazineMenuOpen
              ? '▲'
              : '▼'}
          </button>
        </div>
      </div>

      {selectedInfoSeries && (
        <SeriesInfoCard
          series={selectedInfoSeries}
          magazineList={magazineList}
          navigate={navigate}
          onClose={() => {
            setSelectedInfoSeries(null)
          }}
        />
      )}

    </div>
  )
}

export default CompletedSeriesPage
