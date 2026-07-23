import {
  Fragment,
  useEffect,
  useRef,
  useState
} from 'react'
import ImageView from '../components/ImageView'
import SeriesActionPanel from '../components/SeriesActionPanel'
import IssueInputRow from '../components/IssueInputRow'
import IssueLabel from '../components/IssueLabel'
import HartaGroupBadge from '../components/HartaGroupBadge'

import {
  clampIssueForYear,
  getIssueOptions,
  getYearOptions,
  getEstimatedLatestIssueInfo,
  formatIssueSpanPeriod,
  getIssueSpanCount,
  getIssueSerial
} from '../utils/issueUtils'
import {
  HARTA_GROUP_OPTIONS,
  normalizeHartaGroup
} from '../utils/hartaGroups'

const viewModeOptions = [
  {
    value: 'list',
    label: 'リスト'
  },
  {
    value: 'grid',
    label: 'グリッド'
  }
]

const viewModeLabelMap = {
  list: 'リスト',
  grid: 'グリッド'
}

const unreadZeroLabelMap = {
  true: '未読0を非表示',
  false: '未読0を表示'
}

const sortOptions = [
  {
    value: 'unread',
    label: '未読順'
  },
  {
    value: 'read',
    label: '読了順'
  },
  {
    value: 'title',
    label: '作品名順'
  },
  {
    value: 'start',
    label: '開始号順'
  },
  {
    value: 'duration',
    label: '連載期間順'
  }
]

const SERIES_RETURN_STATE_KEY =
  'manga-manager-series-return-state'

function MagazineSeriesPage({
  magazineList,
  seriesList,
  viewMode,
  setViewMode,
  sortMode,
  setSortMode,
  sortDirection,
  setSortDirection,
  secondarySortMode,
  setSecondarySortMode,
  secondarySortDirection,
  setSecondarySortDirection,
  saveDefaultSeriesSort,
  showCompleted,
  setShowCompleted,
  showUnreadZeroOngoing,
  setShowUnreadZeroOngoing,
  menuSeriesId,
  setMenuSeriesId,
  selectedSeriesIds,
  setSelectedSeriesIds,
  bulkIssueYear,
  setBulkIssueYear,
  bulkIssueValue,
  setBulkIssueValue,
  getUnreadCount,
  getEstimatedLatestIssue,
  addIssue,
  minusIssue,
  bulkAddIssue,
  bulkMinusIssue,
  bulkAddIssueByHartaGroups,
  bulkMinusIssueByHartaGroups,
  bulkChangeSelectedIssue,
  toggleSeriesSelection,
  toggleStatus,
  updateStatus,
  deleteSeries,
  navigate,
  useParams
}) {
  const params = useParams()

  const magazineId =
    Number(params.magazineId)

  const seriesScrollRef =
    useRef(null)

  const selectedMagazine =
    magazineList.find((magazine) => {
      return magazine.id === magazineId
    })

  if (!selectedMagazine) {
    return (
      <div
        className="app"
        onClick={() =>
          setMenuSeriesId(null)
        }
      >
        <button
          onClick={() => navigate('/')}
        >
          ← 雑誌一覧へ
        </button>

        <div className="title">
          雑誌が見つかりません
        </div>
      </div>
    )
  }

  const estimatedLatestIssue =
    getEstimatedLatestIssueInfo(
      selectedMagazine
    )

  const yearOptions =
    getYearOptions()

  const [
    showSeriesControls,
    setShowSeriesControls
  ] = useState(false)

  const [
    isViewModeMenuOpen,
    setIsViewModeMenuOpen
  ] = useState(false)

  const [
    displaySeriesIds,
    setDisplaySeriesIds
  ] = useState([])

  const [
    selectedHartaGroups,
    setSelectedHartaGroups
  ] = useState([])

  const currentViewMode =
    viewMode === 'compact'
      ? 'list'
      : viewMode

  const currentShowImages =
    true

  const getSafeIssueSerial = (
    year,
    issue
  ) => {
    const normalizedIssue =
      Number(issue) || 0

    if (!normalizedIssue) {
      return 0
    }

    const normalizedYear =
      Number(year) ||
      new Date().getFullYear()

    return getIssueSerial(
      normalizedYear,
      normalizedIssue,
      selectedMagazine
    )
  }

  const compareSeriesBySortMode = (
    mode,
    a,
    b
  ) => {
    switch (mode) {
      case 'unread':
        return (
          getUnreadCount(a) -
          getUnreadCount(b)
        )

      case 'title':
        return (a.title || '').localeCompare(
          b.title || '',
          'ja'
        )

      case 'issue':
      case 'read':
        return (
          getSafeIssueSerial(
            a.issueYear,
            a.issue
          ) -
          getSafeIssueSerial(
            b.issueYear,
            b.issue
          )
        )

      case 'start':
        return (
          getSafeIssueSerial(
            a.startIssueYear,
            a.startIssue
          ) -
          getSafeIssueSerial(
            b.startIssueYear,
            b.startIssue
          )
        )

      case 'duration':
        return (
          getSeriesPeriodSerial(a) -
          getSeriesPeriodSerial(b)
        )

      default:
        return 0
    }
  }

  const compareSeriesBySort = (
    mode,
    direction,
    a,
    b
  ) => {
    const result =
      compareSeriesBySortMode(mode, a, b)

    return direction === 'asc'
      ? result
      : result * -1
  }

  const shouldShowStartIssue =
    true

  const isHarta =
    selectedMagazine.frequency === 'harta'

  const hasSelectedHartaGroups =
    isHarta &&
    selectedHartaGroups.length > 0

  const isFinishedSeries = (item) => {
    return (
      item.status === 'completed' ||
      Number(item.completedIssue) > 0
    )
  }

  const shouldShowByUnreadZeroFilter = (item) => {
    if (showUnreadZeroOngoing) {
      return true
    }

    if (item.status === 'completed') {
      return false
    }

    if (item.status === 'paused') {
      return false
    }

    return !(
      item.status === 'ongoing' &&
      getUnreadCount(item) === 0
    )
  }

  const shouldShowByHartaGroup = (item) => {
    if (!hasSelectedHartaGroups) {
      return true
    }

    return selectedHartaGroups.includes(
      normalizeHartaGroup(item.hartaGroup)
    )
  }

  const renderReadIssueLabel = (item) => {
    return (
      <IssueLabel
        magazine={selectedMagazine}
        year={
          item.issueYear ||
          new Date().getFullYear()
        }
        issue={item.issue}
      />
    )
  }

  const renderStartIssueLabel = (item) => {
    const startIssue =
      Number(item.startIssue) || 0

    if (!startIssue) {
      return '-'
    }

    return (
      <IssueLabel
        magazine={selectedMagazine}
        year={
          item.startIssueYear ||
          new Date().getFullYear()
        }
        issue={startIssue}
      />
    )
  }

  const getSeriesPeriodSerial = (item) => {
    const completedIssue =
      Number(item.completedIssue) || 0

    let endIssueInfo

    if (completedIssue) {
      endIssueInfo = {
        year: item.completedIssueYear,
        issue: completedIssue
      }
    } else if (
      item.status === 'completed' ||
      item.status === 'paused'
    ) {
      endIssueInfo = {
        year: item.issueYear,
        issue: item.issue
      }
    } else {
      endIssueInfo = estimatedLatestIssue
    }

    return getIssueSpanCount(
      selectedMagazine,
      item.startIssueYear,
      item.startIssue,
      endIssueInfo.year,
      endIssueInfo.issue
    )
  }

  const formatSeriesPeriod = (item) => {
    const diff =
      getSeriesPeriodSerial(item)

    return formatIssueSpanPeriod(
      selectedMagazine,
      diff,
      item.startIssueYear
    )
  }

  const renderStatusText = (
    item,
    unreadCount
  ) => {
    if (item.status === 'paused') {
      return '休載中'
    }

    return item.status === 'completed'
      ? '完結'
      : `未読 ${unreadCount}`
  }

  const formatSeriesAuthors = (item) => {
    const author =
      (item.author || '').trim()

    const storyAuthor =
      (item.storyAuthor || '').trim()

    const artAuthor =
      (item.artAuthor || '').trim()

    const scriptAuthor =
      (item.scriptAuthor || '').trim()

    if (storyAuthor || artAuthor || scriptAuthor) {
      return [
        storyAuthor
          ? `原作: ${storyAuthor}`
          : '',
        artAuthor
          ? `作画: ${artAuthor}`
          : '',
        scriptAuthor
          ? `脚本: ${scriptAuthor}`
          : ''
      ]
        .filter(Boolean)
        .join(' / ')
    }

    return author
  }

  const renderSeriesAuthor = (
    item,
    className = 'series-author-debug'
  ) => {
    const label =
      formatSeriesAuthors(item)

    if (!label) {
      return null
    }

    return (
      <div className={className}>
        {label}
      </div>
    )
  }

  const renderStatusBadges = (
    item,
    unreadCount,
    baseClassName
  ) => {
    const content = (
      <>
        <HartaGroupBadge
          magazine={selectedMagazine}
          series={item}
        />

        <span>
          {renderStatusText(
            item,
            unreadCount
          )}
        </span>
      </>
    )

    return (
      <div className="series-status-badge-row">
        <div className={baseClassName}>
          {content}
        </div>

        <div className="series-period-badge">
          {formatSeriesPeriod(item)}
        </div>
      </div>
    )
  }

  const createSortedSeries = () => {
    return seriesList
      .filter((item) => {
        if (item.magazineId !== magazineId) {
          return false
        }

        if (
          !showCompleted &&
          isFinishedSeries(item)
        ) {
          return false
        }

        if (!shouldShowByHartaGroup(item)) {
          return false
        }

        if (!shouldShowByUnreadZeroFilter(item)) {
          return false
        }

        return true
      })
      .sort((a, b) => {
        const primaryResult =
          compareSeriesBySort(
            sortMode,
            sortDirection,
            a,
            b
          )

        if (primaryResult !== 0) {
          return primaryResult
        }

        const secondaryResult =
          compareSeriesBySort(
            secondarySortMode,
            secondarySortDirection,
            a,
            b
          )

        if (secondaryResult === 0) {
          if (
            !isFinishedSeries(a) &&
            isFinishedSeries(b)
          ) {
            return -1
          }

          if (
            isFinishedSeries(a) &&
            !isFinishedSeries(b)
          ) {
            return 1
          }

          return (a.title || '').localeCompare(
            b.title || '',
            'ja'
          )
        }

        return secondaryResult
      })
  }

  const getReturnState = () => {
    try {
      const rawValue =
        sessionStorage.getItem(
          SERIES_RETURN_STATE_KEY
        )

      return rawValue
        ? JSON.parse(rawValue)
        : null
    } catch (error) {
      console.error(error)
      return null
    }
  }

  const clearReturnState = () => {
    sessionStorage.removeItem(
      SERIES_RETURN_STATE_KEY
    )
  }

  const saveReturnState = (
    item,
    options = {}
  ) => {
    const currentIndex =
      displaySeries.findIndex((series) => {
        return series.id === item.id
      })

    const fallbackSeries =
      currentIndex >= 0
        ? displaySeries[currentIndex + 1] ||
          displaySeries[currentIndex - 1]
        : null

    sessionStorage.setItem(
      SERIES_RETURN_STATE_KEY,
      JSON.stringify({
        magazineId,
        targetSeriesId: item.id,
        fallbackSeriesId:
          options.fallbackSeriesId ??
          fallbackSeries?.id ??
          null,
        scrollTop:
          seriesScrollRef.current?.scrollTop ?? 0,
        displaySeriesIds,
        sortMode,
        sortDirection,
        secondarySortMode,
        secondarySortDirection,
        showCompleted,
        showUnreadZeroOngoing,
        viewMode: currentViewMode
      })
    )
  }

  const saveReturnStateAndEdit = (item) => {
    saveReturnState(item)

    navigate(
      `/series/${item.id}`
    )
  }

  const deleteSeriesAndRestorePosition = (id) => {
    const item =
      displaySeries.find((series) => {
        return series.id === id
      })

    if (item) {
      saveReturnState(item)
    }

    deleteSeries(
      id,
      {
        navigateBack: false
      }
    )
  }

  useEffect(() => {
    if (viewMode !== 'compact') {
      return
    }

    setViewMode('list')
  }, [
    viewMode,
    setViewMode
  ])

  useEffect(() => {
    const returnState =
      getReturnState()

    if (
      returnState &&
      returnState.magazineId === magazineId &&
      returnState.sortMode === sortMode &&
      returnState.sortDirection === sortDirection &&
      returnState.secondarySortMode ===
        secondarySortMode &&
      returnState.secondarySortDirection ===
        secondarySortDirection &&
      returnState.showCompleted === showCompleted &&
      returnState.showUnreadZeroOngoing ===
        showUnreadZeroOngoing &&
      Array.isArray(
        returnState.displaySeriesIds
      )
    ) {
      setDisplaySeriesIds(
        returnState.displaySeriesIds
      )
      return
    }

    if (returnState) {
      clearReturnState()
    }

    setDisplaySeriesIds(
      createSortedSeries().map((item) => {
        return item.id
      })
    )
  }, [
    magazineId,
    sortMode,
    sortDirection,
    secondarySortMode,
    secondarySortDirection,
    showCompleted,
    showUnreadZeroOngoing,
    selectedHartaGroups
  ])

  useEffect(() => {
    setSelectedHartaGroups([])
  }, [
    magazineId
  ])

  const displaySeries =
    displaySeriesIds
      .map((id) => {
        return seriesList.find((item) => {
          return item.id === id
        })
      })
      .filter((item) => {
        if (!item) {
          return false
        }

        if (item.magazineId !== magazineId) {
          return false
        }

        if (
          !showCompleted &&
          isFinishedSeries(item)
        ) {
          return false
        }

        if (!shouldShowByHartaGroup(item)) {
          return false
        }

        return true
      })

  useEffect(() => {
    const returnState =
      getReturnState()

    if (
      !returnState ||
      returnState.magazineId !== magazineId ||
      !returnState.targetSeriesId ||
      displaySeries.length === 0
    ) {
      return
    }

    const frameId =
      requestAnimationFrame(() => {
        const scrollArea =
          seriesScrollRef.current

        const targetElement =
          scrollArea?.querySelector(
            `[data-series-card-id="${returnState.targetSeriesId}"]`
          ) ||
          (
            returnState.fallbackSeriesId
              ? scrollArea?.querySelector(
                  `[data-series-card-id="${returnState.fallbackSeriesId}"]`
                )
              : null
          )

        if (
          scrollArea &&
          targetElement
        ) {
          const areaRect =
            scrollArea.getBoundingClientRect()

          const targetRect =
            targetElement.getBoundingClientRect()

          scrollArea.scrollTop +=
            targetRect.top -
            areaRect.top -
            12
        } else if (
          scrollArea &&
          typeof returnState.scrollTop === 'number'
        ) {
          scrollArea.scrollTop =
            returnState.scrollTop
        }

        if (targetElement) {
          setMenuSeriesId(
            Number(
              targetElement.getAttribute(
                'data-series-card-id'
              )
            ) || null
          )
        }

        clearReturnState()
      })

    return () => {
      cancelAnimationFrame(frameId)
    }
  }, [
    magazineId,
    displaySeriesIds,
    displaySeries.length,
    setMenuSeriesId
  ])

  const selectableDisplaySeriesIds =
    displaySeries
      .filter((item) => {
        return !isFinishedSeries(item)
      })
      .map((item) => {
      return item.id
      })

  const gridColumnCount = 3

  const expandedGridIndex =
    displaySeries.findIndex((item) => {
      return item.id === menuSeriesId
    })

  const expandedGridItem =
    expandedGridIndex >= 0
      ? displaySeries[expandedGridIndex]
      : null

  const shouldShowGridActionPanel =
    selectedSeriesIds.length <= 1

  const expandedGridRowEndIndex =
    expandedGridIndex >= 0
      ? Math.min(
          displaySeries.length - 1,
          Math.floor(
            expandedGridIndex /
              gridColumnCount
          ) *
            gridColumnCount +
            gridColumnCount -
            1
        )
      : -1

  const latestIssueSerial =
    getIssueSerial(
      estimatedLatestIssue.year,
      estimatedLatestIssue.issue,
      selectedMagazine
    )

  const normalizeBulkIssueValue = (
    year,
    issue
  ) => {
    if (issue === '') {
      return ''
    }

    const clampedIssue =
      clampIssueForYear(
        selectedMagazine,
        year,
        issue,
        {
          includeUnread: true
        }
      )

    const numericIssue =
      Number(clampedIssue) || 0

    if (!numericIssue || isHarta) {
      return clampedIssue
    }

    const issueSerial =
      getIssueSerial(
        Number(year) ||
          estimatedLatestIssue.year,
        numericIssue,
        selectedMagazine
      )

    if (issueSerial <= latestIssueSerial) {
      return numericIssue
    }

    if (
      Number(year) ===
      estimatedLatestIssue.year
    ) {
      return estimatedLatestIssue.issue
    }

    return 0
  }

  const bulkIssueOptions =
    getIssueOptions(
      selectedMagazine,
      bulkIssueYear,
      {
        includeUnread: true
      }
    ).filter((option) => {
      const issue =
        Number(option.value) || 0

      if (!issue || isHarta) {
        return true
      }

      return (
        getIssueSerial(
          Number(bulkIssueYear) ||
            estimatedLatestIssue.year,
          issue,
          selectedMagazine
        ) <= latestIssueSerial
      )
    })

  const handleBulkIssueYearChange = (year) => {
    setBulkIssueYear(year)

    setBulkIssueValue(
      normalizeBulkIssueValue(
        year,
        bulkIssueValue
      )
    )
  }

  const areAllDisplaySeriesSelected =
    selectableDisplaySeriesIds.length > 0 &&
    selectableDisplaySeriesIds.every((id) => {
      return selectedSeriesIds.includes(id)
    })

  const toggleDisplaySeriesSelection = () => {
    if (!setSelectedSeriesIds) {
      return
    }

    setSelectedSeriesIds((prevIds) => {
      if (areAllDisplaySeriesSelected) {
        return prevIds.filter((id) => {
          return !selectableDisplaySeriesIds.includes(id)
        })
      }

      return Array.from(
        new Set([
          ...prevIds,
          ...selectableDisplaySeriesIds
        ])
      )
    })
  }

  const toggleHartaGroup = (group) => {
    setSelectedHartaGroups((prevGroups) => {
      if (prevGroups.includes(group)) {
        return prevGroups.filter((item) => {
          return item !== group
        })
      }

      return [
        ...prevGroups,
        group
      ]
    })
  }

  const handleHartaBulkAdd = () => {
    if (selectedHartaGroups.length === 0) {
      window.alert('区分を選択してください')
      return
    }

    bulkAddIssueByHartaGroups(
      magazineId,
      selectedHartaGroups
    )
  }

  const handleHartaBulkMinus = () => {
    if (selectedHartaGroups.length === 0) {
      window.alert('区分を選択してください')
      return
    }

    bulkMinusIssueByHartaGroups(
      magazineId,
      selectedHartaGroups
    )
  }

  return (
    <div className="app series-page">

      <div className="series-fixed-header">

        <div className="series-page-header">

          <button
            className="back-button"
            onClick={() =>
              navigate(
                '/',
                { replace: true }
              )
            }
          >
            ← 戻る
          </button>

          <div className="title series-page-title">
            {selectedMagazine.name}
          </div>

          <button
            className="mode-button"
            onClick={() =>
              navigate(
                `/magazine/${magazineId}/add`
              )
            }
          >
            作品追加
          </button>

        </div>

        <div
          className="latest-issue-box"
          onClick={() =>
            setShowSeriesControls(
              !showSeriesControls
            )
          }
        >
          <span>
            {showSeriesControls
              ? '最新号'
              : '最新号'}
          </span>

          <strong>
            <IssueLabel
              magazine={selectedMagazine}
              year={estimatedLatestIssue.year}
              issue={estimatedLatestIssue.issue}
            />
          </strong>
        </div>

        {showSeriesControls && (
          <>
            <div className="sort-controls">
              <div className="sort-row sort-row-with-button">
                <select
                  value={sortMode}
                  onChange={(e) =>
                    setSortMode(
                      e.target.value
                    )
                  }
                >
                  {sortOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
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

              <div className="sort-row sort-row-with-button">
                <select
                  value={secondarySortMode}
                  onChange={(e) =>
                    setSecondarySortMode(
                      e.target.value
                    )
                  }
                >
                  <option value="none">
                    指定なし
                  </option>

                  {sortOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() =>
                    setSecondarySortDirection(
                      secondarySortDirection ===
                        'asc'
                        ? 'desc'
                        : 'asc'
                    )
                  }
                >
                  {secondarySortDirection === 'asc'
                    ? '昇順'
                    : '降順'}
                </button>
              </div>

              <button
                type="button"
                className="sort-default-button"
                onClick={saveDefaultSeriesSort}
              >
                デフォルトにする
              </button>
            </div>

            {currentViewMode === 'grid' && (

              <div className="bulk-issue-box">

              <IssueInputRow
                yearValue={bulkIssueYear}
                onYearChange={setBulkIssueYear}
                issueValue={
                  normalizeBulkIssueValue(
                    bulkIssueYear,
                    bulkIssueValue
                  )
                }
                onIssueChange={(value) =>
                  setBulkIssueValue(
                    normalizeBulkIssueValue(
                      bulkIssueYear,
                      value
                    )
                  )
                }
                yearOptions={yearOptions}
                issueOptions={bulkIssueOptions}
                useIssueSelect={!isHarta}
                showYear={!isHarta}
                prefix={isHarta ? 'volume' : ''}
                suffix={isHarta ? '' : undefined}
                emptyIssueValue=""
                className={`bulk-issue-input-row ${
                  isHarta
                    ? 'harta-issue-input-row'
                    : ''
                }`}
                onYearSelected={
                  handleBulkIssueYearChange
                }
              />

              <button
                onClick={bulkChangeSelectedIssue}
              >
                一括変更
              </button>

              <button
                type="button"
                onClick={
                  toggleDisplaySeriesSelection
                }
              >
                {areAllDisplaySeriesSelected
                  ? '全解除'
                  : '全選択'}
              </button>

              </div>

            )}

            {isHarta ? (
              <div className="harta-group-bulk-actions">
                {HARTA_GROUP_OPTIONS.map((option) => {
                  const isSelected =
                    selectedHartaGroups.includes(
                      option.value
                    )

                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`harta-group-toggle ${
                        isSelected ? 'active' : ''
                      }`}
                      onClick={() =>
                        toggleHartaGroup(
                          option.value
                        )
                      }
                    >
                      {option.label}
                    </button>
                  )
                })}

                <button
                  type="button"
                  className="harta-group-step"
                  onClick={handleHartaBulkAdd}
                >
                  +1
                </button>

                <button
                  type="button"
                  className="harta-group-step minus-button"
                  onClick={handleHartaBulkMinus}
                >
                  -1
                </button>
              </div>
            ) : (
              <div className="series-tool-row">

            <button
              className="bulk-button"
              onClick={() =>
                bulkAddIssue(magazineId)
              }
            >
              全連載 +1
            </button>

            <button
              className="minus-button"
              onClick={() =>
                bulkMinusIssue(magazineId)
              }
            >
              全連載 -1
            </button>

              </div>
            )}
          </>
        )}

      </div>

      <div
        className="series-scroll-area"
        ref={seriesScrollRef}
      >

      {currentViewMode === 'list' && currentShowImages ? (

        displaySeries.map((item) => {
          const unreadCount =
            getUnreadCount(item)

          return (
            <div
              className={`series-list-card ${
                item.status === 'completed'
                  ? 'completed'
                  : ''
              } ${
                selectedSeriesIds.includes(
                  item.id
                )
                  ? 'selected'
                  : ''
              } ${
                menuSeriesId === item.id
                  ? 'expanded'
                  : ''
              }`}
              key={item.id}
              data-series-card-id={item.id}
              onClick={(e) => {
                e.stopPropagation()

                setMenuSeriesId(
                  menuSeriesId === item.id
                    ? null
                    : item.id
                )
              }}
            >
              <div className="series-cover-small">

                <ImageView
                  imageId={item.imageId}
                  fallbackImage={item.image}
                />

              </div>

              <div className="series-info">

                <div className="series-title">
                  {item.title}
                </div>

                {renderSeriesAuthor(item)}

                <div className="series-issue issue-display-row">
                  <span className="issue-display-label">
                    読了：
                  </span>

                  {renderReadIssueLabel(item)}
                </div>

                {shouldShowStartIssue && (
                  <div className="series-start-issue issue-display-row">
                    <span className="issue-display-label">
                      開始：
                    </span>

                    {renderStartIssueLabel(item)}
                  </div>
                )}

                {renderStatusBadges(
                  item,
                  unreadCount,
                  'status-badge'
                )}

              </div>

              <div
                className="series-step-buttons"
                onClick={(e) =>
                  e.stopPropagation()
                }
              >
                <button
                  onClick={() =>
                    addIssue(item.id)
                  }
                >
                  +1
                </button>

                <button
                  className="minus-button"
                  onClick={() =>
                    minusIssue(item.id)
                  }
                >
                  -1
                </button>
              </div>

              {menuSeriesId === item.id && (
                <SeriesActionPanel
                  item={item}
                  navigate={navigate}
                  toggleStatus={toggleStatus}
                  updateStatus={updateStatus}
                  deleteSeries={
                    deleteSeriesAndRestorePosition
                  }
                  onEdit={saveReturnStateAndEdit}
                  onClose={() =>
                    setMenuSeriesId(null)
                  }
                />
              )}

            </div>
          )
        })

      ) : currentViewMode === 'list' ? (

        <div className="series-compact-list">

          {displaySeries.map((item) => {
            const unreadCount =
              getUnreadCount(item)

            return (
              <div
                className={`series-compact-card ${
                  item.status === 'completed'
                    ? 'completed'
                    : ''
                } ${
                  menuSeriesId === item.id
                    ? 'expanded'
                    : ''
                }`}
                key={item.id}
                data-series-card-id={item.id}
                onClick={(e) => {
                  e.stopPropagation()

                  setMenuSeriesId(
                    menuSeriesId === item.id
                      ? null
                      : item.id
                  )
                }}
              >
                <div className="series-compact-main">

                  <div className="series-compact-title">
                    {item.title}
                  </div>

                  {renderSeriesAuthor(
                    item,
                    'series-compact-author-debug'
                  )}

                  <div className="series-compact-meta">
                    <span>
                      読了 {renderReadIssueLabel(item)}
                    </span>

                    {renderStatusBadges(
                      item,
                      unreadCount,
                      'series-compact-status'
                    )}

                    {shouldShowStartIssue && (
                      <span className="series-compact-start-issue">
                        <span className="series-compact-start-label">
                          開始
                        </span>
                        {' '}
                        {renderStartIssueLabel(item)}
                      </span>
                    )}
                  </div>

                </div>

                <div className="series-compact-buttons">
                  <button
                    className="minus-button"
                    onClick={(e) => {
                      e.stopPropagation()
                      minusIssue(item.id)
                    }}
                  >
                    -1
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      addIssue(item.id)
                    }}
                  >
                    +1
                  </button>
                </div>

                {menuSeriesId === item.id && (
                  <SeriesActionPanel
                    item={item}
                    navigate={navigate}
                    toggleStatus={toggleStatus}
                    updateStatus={updateStatus}
                    deleteSeries={
                      deleteSeriesAndRestorePosition
                    }
                    onEdit={saveReturnStateAndEdit}
                    onClose={() =>
                      setMenuSeriesId(null)
                    }
                  />
                )}
              </div>
            )
          })}

        </div>

      ) : (

        <div
          className={`grid ${
            currentShowImages
              ? ''
              : 'grid-no-images'
          }`}
        >

          {displaySeries.map((item, index) => (

            <Fragment
              key={item.id}
            >
              <div
                className={`card ${
                  item.status === 'completed'
                    ? 'completed'
                    : ''
                } ${
                  selectedSeriesIds.includes(
                    item.id
                  )
                    ? 'selected'
                    : ''
                } ${
                  selectedSeriesIds.includes(
                    item.id
                  ) &&
                  selectedSeriesIds.length === 1
                    ? 'single-selected'
                    : ''
                } ${
                  menuSeriesId === item.id &&
                  shouldShowGridActionPanel
                    ? 'expanded'
                    : ''
                } ${
                  currentShowImages
                    ? ''
                    : 'card-no-image'
                }`}
                data-series-card-id={item.id}
                onClick={(e) => {
                  e.stopPropagation()

                  if (
                    item.status === 'completed'
                  ) {
                    if (selectedSeriesIds.length > 1) {
                      setMenuSeriesId(null)
                      return
                    }

                    setMenuSeriesId(
                      menuSeriesId === item.id
                        ? null
                        : item.id
                    )
                    return
                  }

                  const isSelected =
                    selectedSeriesIds.includes(
                      item.id
                    )

                  const nextSelectedCount =
                    isSelected
                      ? Math.max(
                          0,
                          selectedSeriesIds.length - 1
                        )
                      : selectedSeriesIds.length + 1

                  toggleSeriesSelection(
                    item.id
                  )

                  if (isSelected) {
                    if (menuSeriesId === item.id) {
                      setMenuSeriesId(null)
                    }

                    return
                  }

                  setMenuSeriesId(
                    nextSelectedCount === 1
                      ? item.id
                      : null
                  )
                }}
              >

                {currentShowImages && (
                  <div className="cover">

                    <ImageView
                      imageId={item.imageId}
                      fallbackImage={item.image}
                    />

                  </div>
                )}

                <div className="card-title">
                  {item.title}
                </div>

                {renderSeriesAuthor(
                  item,
                  'card-author-debug'
                )}

                <div className="card-issue">
                  {renderReadIssueLabel(item)}
                </div>

                {shouldShowStartIssue && (
                  <div className="card-start-issue">
                    <span className="card-start-label">
                      開始
                    </span>

                    {renderStartIssueLabel(item)}
                  </div>
                )}

                {renderStatusBadges(
                  item,
                  getUnreadCount(item),
                  'card-unread'
                )}

                <div className="card-step-buttons">
                  <button
                    type="button"
                    className="minus-button"
                    onClick={(e) => {
                      e.stopPropagation()
                      minusIssue(item.id)
                    }}
                  >
                    -1
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      addIssue(item.id)
                    }}
                  >
                    +1
                  </button>
                </div>

              </div>

              {expandedGridItem &&
                shouldShowGridActionPanel &&
                expandedGridRowEndIndex ===
                  index && (
                  <SeriesActionPanel
                    item={expandedGridItem}
                    navigate={navigate}
                    toggleStatus={toggleStatus}
                    updateStatus={updateStatus}
                    deleteSeries={
                      deleteSeriesAndRestorePosition
                    }
                    className="grid-popup-menu"
                    onEdit={saveReturnStateAndEdit}
                    onClose={() =>
                      setMenuSeriesId(null)
                    }
                  />
                )}
            </Fragment>
          ))}

        </div>

      )}

      {isViewModeMenuOpen && (
        <div
          className="view-mode-menu-backdrop"
          onClick={() => {
            setIsViewModeMenuOpen(false)
          }}
        />
      )}

      </div>

      <div className="bottom-nav series-bottom-nav series-fixed-footer">

        <div
          className="view-mode-selector"
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
              {viewModeOptions.map((option) => {
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
              setIsViewModeMenuOpen(
                (isOpen) => !isOpen
              )
            }}
          >
            {viewModeLabelMap[currentViewMode] ||
              'リスト'}
            {' '}
            {isViewModeMenuOpen
              ? '▲'
              : '▼'}
          </button>
        </div>

        <button
          type="button"
          onClick={() =>
            setShowUnreadZeroOngoing(
              !showUnreadZeroOngoing
            )
          }
        >
          {
            unreadZeroLabelMap[
              String(showUnreadZeroOngoing)
            ]
          }
        </button>

        <button
          onClick={() =>
            setShowCompleted(
              !showCompleted
            )
          }
        >
          {showCompleted
            ? '完結を非表示'
            : '完結を表示'}
        </button>

      </div>

    </div>
  )
}

export default MagazineSeriesPage
