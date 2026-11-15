import {
  useEffect,
  useMemo,
  useState
} from 'react'
import {
  useParams,
  useSearchParams
} from 'react-router-dom'
import CloudImage from '../components/CloudImage'
import CropSettings from '../components/CropSettings'
import MagazineRename from '../components/MagazineRename'
import {
  loadRootIndex,
  loadYearIndex,
  loadYearIndexes
} from '../utils/colorStore'
import {
  SERIES_FILTERS,
  SERIES_SORTS,
  SERIES_STATUS_LABELS,
  arrangeSeriesGroups,
  findAppMagazine,
  getCatalogRange,
  getCatalogYears,
  listCatalogIssues,
  listCatalogSeriesEntries,
  mergeSeriesGroups
} from '../utils/colorCatalog'
import {
  collectSeries,
  compareIssueFolders,
  formatIssueFolder,
  issueFolder,
  listIssues,
  normalizeSlug,
  normalizeYear,
  parseIssueLabel,
  thumbKey
} from '../utils/colorLibrary'

// 号の代表画像。表紙があれば表紙、なければ先頭の1枚。
function pickCover(images) {
  return (
    images.find(
      (image) => image.kind === 'cover'
    ) || images[0]
  )
}

function ColorMagazinePage({
  magazineList,
  seriesList,
  navigate
}) {
  const params = useParams()
  const [searchParams, setSearchParams] =
    useSearchParams()

  const slug = normalizeSlug(params.slug)

  const requestedYear =
    normalizeYear(searchParams.get('y'))

  // 表示の切り替え。号ごと（issues）か、作品ごと（series）。
  const view =
    searchParams.get('v') === 'series'
      ? 'series'
      : 'issues'

  // 作品ごとの表示の絞り込みと並べ順
  const filter =
    SERIES_FILTERS.some(
      (item) =>
        item.id === searchParams.get('f')
    )
      ? searchParams.get('f')
      : 'all'

  const sort =
    SERIES_SORTS.some(
      (item) =>
        item.id === searchParams.get('s')
    )
      ? searchParams.get('s')
      : 'new'

  const [state, setState] =
    useState({
      status: 'loading',
      key: '',
      magazine: null,
      year: 0,
      index: null,
      seriesGroups: [],
      fromCache: false,
      error: ''
    })

  const [issueInput, setIssueInput] =
    useState('')
  const [yearInput, setYearInput] =
    useState('')
  const [formError, setFormError] =
    useState('')

  const loadKey =
    `${slug}:${requestedYear}:${view}`

  useEffect(() => {
    if (!slug) {
      return undefined
    }

    let active = true

    const load = async () => {
      const rootResult =
        await loadRootIndex()

      const magazine =
        rootResult.root.magazines.find(
          (item) => item.slug === slug
        )

      if (!magazine) {
        throw new Error(
          'この雑誌は登録されていません。'
        )
      }

      // 号の一覧がある雑誌は最新号の年、ない雑誌は画像のある最新の年を開く
      const range =
        getCatalogRange(
          magazine,
          findAppMagazine(
            magazine,
            magazineList
          )
        )

      const year =
        requestedYear ||
        range?.latest.year ||
        magazine.years[0] ||
        new Date().getFullYear()

      if (view === 'series') {
        const result =
          await loadYearIndexes(
            slug,
            magazine.years
          )

        return {
          status: 'ready',
          key: loadKey,
          magazine,
          year,
          index: null,
          seriesGroups: collectSeries(
            result.indexes
          ),
          fromCache:
            rootResult.fromCache ||
            result.fromCache,
          error: ''
        }
      }

      const yearResult =
        await loadYearIndex(slug, year)

      return {
        status: 'ready',
        key: loadKey,
        magazine,
        year,
        index: yearResult.index,
        seriesGroups: [],
        fromCache:
          rootResult.fromCache ||
          yearResult.fromCache,
        error: ''
      }
    }

    load()
      .then((next) => {
        if (active) {
          setState(next)
        }
      })
      .catch((error) => {
        if (active) {
          setState({
            status: 'error',
            key: loadKey,
            magazine: null,
            year: 0,
            index: null,
            seriesGroups: [],
            fromCache: false,
            error:
              error?.message ||
              '読み込めませんでした。'
          })
        }
      })

    return () => {
      active = false
    }
  }, [
    slug,
    requestedYear,
    view,
    loadKey,
    magazineList
  ])

  // アプリに登録済みの号数の決まりと作品から作る、号と作品の一覧
  const appMagazine =
    useMemo(
      () =>
        findAppMagazine(
          state.magazine,
          magazineList
        ),
      [state.magazine, magazineList]
    )

  const range =
    useMemo(
      () =>
        getCatalogRange(
          state.magazine,
          appMagazine
        ),
      [state.magazine, appMagazine]
    )

  const catalogSeries =
    useMemo(
      () =>
        listCatalogSeriesEntries(
          seriesList,
          appMagazine,
          range
        ),
      [seriesList, appMagazine, range]
    )

  const isSwitching =
    state.status === 'ready' &&
    state.key !== loadKey

  const yearOptions =
    state.magazine
      ? Array.from(
          new Set([
            ...getCatalogYears(range),
            ...state.magazine.years,
            state.year,
            new Date().getFullYear()
          ])
        ).sort((a, b) => b - a)
      : []

  // 画像のある号と、一覧にある号（まだ画像のないもの）を合わせて、新しい号から並べる
  const issues =
    state.index
      ? (() => {
          const registered =
            new Map(
              listIssues(state.index).map(
                (issue) => [
                  issue.folder,
                  issue.images
                ]
              )
            )

          return Array.from(
            new Set([
              ...listCatalogIssues(
                appMagazine,
                state.year,
                range
              ),
              ...registered.keys()
            ])
          )
            .sort(compareIssueFolders)
            .reverse()
            .map((folder) => ({
              folder,
              images:
                registered.get(folder) || []
            }))
        })()
      : []

  // アプリの連載データの作品と、タグの付いた作品を合わせて、絞り込み・並べ替える
  const seriesGroups =
    arrangeSeriesGroups(
      mergeSeriesGroups(
        catalogSeries,
        state.seriesGroups
      ),
      filter,
      sort
    )

  const updateSearch = (changes) => {
    const next = {}

    const year =
      changes.y ?? (state.year || '')

    const nextView = changes.v ?? view
    const nextFilter = changes.f ?? filter
    const nextSort = changes.s ?? sort

    if (year) {
      next.y = String(year)
    }

    if (nextView === 'series') {
      next.v = 'series'

      if (nextFilter !== 'all') {
        next.f = nextFilter
      }

      if (nextSort !== 'new') {
        next.s = nextSort
      }
    }

    setSearchParams(next, {
      replace: true
    })
  }

  const openYear = (value) => {
    const year = normalizeYear(value)

    if (!year) {
      setFormError(
        '年は西暦4桁で入力してください。'
      )
      return
    }

    setFormError('')
    setYearInput('')
    updateSearch({ y: year })
  }

  const openIssue = (event) => {
    event.preventDefault()

    const issue =
      parseIssueLabel(issueInput)

    if (!issue) {
      setFormError(
        '号は「50」や「4-5」（合併号）のように入力してください。'
      )
      return
    }

    setFormError('')
    navigate(
      `/color/${slug}/${state.year}/${issueFolder(
        issue
      )}`
    )
  }

  return (
    <div className="app">
      <div className="series-page-header">
        <button
          className="back-button"
          onClick={() => navigate('/color')}
        >
          ← 戻る
        </button>

        <div className="title series-page-title">
          {state.magazine?.name ||
            'カラーページ'}
        </div>

        <div />
      </div>

      {!slug && (
        <div className="color-notice error">
          <p>ページが見つかりません。</p>
        </div>
      )}

      {slug &&
        state.status === 'loading' && (
          <div className="empty-message">
            読み込み中…
          </div>
        )}

      {state.status === 'error' && (
        <div className="color-notice error">
          <p>{state.error}</p>
        </div>
      )}

      {state.status === 'ready' && (
        <div className="color-page">
          {state.fromCache && (
            <div className="color-notice">
              <p>
                通信できないため、前回の内容を表示しています。
              </p>
            </div>
          )}

          <div
            className="color-view-switch"
            role="group"
            aria-label="表示の切り替え"
          >
            <button
              type="button"
              className={
                view === 'issues'
                  ? 'active'
                  : ''
              }
              aria-pressed={view === 'issues'}
              onClick={() =>
                updateSearch({ v: 'issues' })
              }
            >
              号ごと
            </button>

            <button
              type="button"
              className={
                view === 'series'
                  ? 'active'
                  : ''
              }
              aria-pressed={view === 'series'}
              onClick={() =>
                updateSearch({ v: 'series' })
              }
            >
              作品ごと
            </button>
          </div>

          {view === 'issues' && (
            <>
              <div className="color-toolbar">
                <label className="color-toolbar-field">
                  <span>年</span>
                  <select
                    value={state.year}
                    onChange={(event) =>
                      openYear(
                        event.target.value
                      )
                    }
                  >
                    {yearOptions.map(
                      (year) => (
                        <option
                          key={year}
                          value={year}
                        >
                          {year}年
                        </option>
                      )
                    )}
                  </select>
                </label>

                <form
                  className="color-toolbar-field"
                  onSubmit={(event) => {
                    event.preventDefault()
                    openYear(yearInput)
                  }}
                >
                  <span>ほかの年</span>
                  <div className="color-inline-form">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="2019"
                      aria-label="ほかの年"
                      value={yearInput}
                      onChange={(event) =>
                        setYearInput(
                          event.target.value
                        )
                      }
                    />
                    <button type="submit">
                      開く
                    </button>
                  </div>
                </form>
              </div>

              <form
                className="color-toolbar-field"
                onSubmit={openIssue}
              >
                <span>
                  号を開く（新しい号の登録もここから）
                </span>
                <div className="color-inline-form">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="50"
                    aria-label="号"
                    value={issueInput}
                    onChange={(event) =>
                      setIssueInput(
                        event.target.value
                      )
                    }
                  />
                  <button type="submit">
                    開く
                  </button>
                </div>
              </form>

              {!state.fromCache && (
                <CropSettings
                  key={state.magazine.slug}
                  magazine={state.magazine}
                  onSaved={(magazine) => {
                    if (magazine) {
                      setState((current) => ({
                        ...current,
                        magazine
                      }))
                    }
                  }}
                />
              )}

              {!state.fromCache && (
                <MagazineRename
                  key={state.magazine.slug}
                  magazine={state.magazine}
                  onRenamed={(magazine) => {
                    if (!magazine) {
                      return
                    }

                    if (magazine.slug !== slug) {
                      navigate(
                        `/color/${magazine.slug}?y=${state.year}`,
                        { replace: true }
                      )
                      return
                    }

                    setState((current) => ({
                      ...current,
                      magazine
                    }))
                  }}
                />
              )}
            </>
          )}

          {formError && (
            <div
              className="cloud-settings-message error"
              role="alert"
            >
              {formError}
            </div>
          )}

          {isSwitching && (
            <div className="empty-message">
              読み込み中…
            </div>
          )}

          {!isSwitching &&
            view === 'issues' &&
            issues.length === 0 && (
              <div className="empty-message">
                {state.year}
                年の画像はまだありません。
              </div>
            )}

          {!isSwitching &&
            view === 'issues' && (
              <div className="color-issue-grid">
                {issues.map((issue) => {
                  const cover =
                    pickCover(issue.images)

                  return (
                    <button
                      key={issue.folder}
                      type="button"
                      className={
                        cover
                          ? 'color-issue-card'
                          : 'color-issue-card empty'
                      }
                      onClick={() =>
                        navigate(
                          `/color/${slug}/${state.year}/${issue.folder}`
                        )
                      }
                    >
                      <div className="color-thumb">
                        {cover ? (
                          <CloudImage
                            imageKey={thumbKey(
                              slug,
                              state.year,
                              issue.folder,
                              cover.file
                            )}
                            alt=""
                          />
                        ) : (
                          <div className="cloud-image-placeholder">
                            未登録
                          </div>
                        )}
                      </div>
                      <span className="color-issue-label">
                        {formatIssueFolder(
                          issue.folder
                        )}
                      </span>
                      <small>
                        {cover
                          ? `${issue.images.length}枚`
                          : '未登録'}
                      </small>
                    </button>
                  )
                })}
              </div>
            )}

          {view === 'series' && (
            <div className="color-series-tools">
              <div
                className="color-chip-row"
                role="group"
                aria-label="絞り込み"
              >
                {SERIES_FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={
                      filter === item.id
                        ? 'color-chip selected'
                        : 'color-chip'
                    }
                    aria-pressed={
                      filter === item.id
                    }
                    onClick={() =>
                      updateSearch({
                        f: item.id
                      })
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <label className="color-toolbar-field">
                <span>並べ順</span>
                <select
                  value={sort}
                  onChange={(event) =>
                    updateSearch({
                      s: event.target.value
                    })
                  }
                >
                  {SERIES_SORTS.map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {!isSwitching &&
            view === 'series' &&
            seriesGroups.length === 0 && (
              <div className="empty-message">
                {filter === 'all'
                  ? '作品がありません。連載の画面で作品を登録するか、号の画面で作品タグを付けると並びます。'
                  : '該当する作品がありません。'}
              </div>
            )}

          {!isSwitching &&
            view === 'series' &&
            seriesGroups.length > 0 && (
              <div className="color-series-list">
                <p className="cloud-settings-note">
                  {seriesGroups.length}作品
                </p>

                {seriesGroups.map((group) => (
                  <button
                    key={group.title}
                    type="button"
                    className={
                      group.cover
                        ? 'color-series-row'
                        : 'color-series-row empty'
                    }
                    onClick={() =>
                      navigate(
                        `/color/${slug}/series/${encodeURIComponent(
                          group.title
                        )}`
                      )
                    }
                  >
                    <div className="color-thumb">
                      {group.cover ? (
                        <CloudImage
                          imageKey={thumbKey(
                            slug,
                            group.cover.year,
                            group.cover.folder,
                            group.cover.file
                          )}
                          alt=""
                        />
                      ) : (
                        <div className="cloud-image-placeholder">
                          未登録
                        </div>
                      )}
                    </div>

                    <div className="color-series-row-body">
                      <span className="color-series-row-title">
                        {group.title}
                      </span>

                      <span className="color-series-row-meta">
                        {SERIES_STATUS_LABELS[
                          group.status
                        ] && (
                          <span
                            className={`color-status-badge ${group.status}`}
                          >
                            {
                              SERIES_STATUS_LABELS[
                                group.status
                              ]
                            }
                          </span>
                        )}
                        {group.count > 0
                          ? `${group.count}枚`
                          : '画像なし'}
                      </span>

                      {group.period && (
                        <span className="color-series-row-meta">
                          {group.period}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
        </div>
      )}
    </div>
  )
}

export default ColorMagazinePage
