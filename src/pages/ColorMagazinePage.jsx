import {
  useEffect,
  useMemo,
  useState
} from 'react'
import {
  useLocation,
  useParams,
  useSearchParams
} from 'react-router-dom'
import useScrollRestore, {
  useGoBack
} from '../hooks/useScrollHeader'
import AppIcon from '../components/AppIcon'
import CloudImage from '../components/CloudImage'
import ImageView from '../components/ImageView'
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

// 直前に表示した内容。戻ってきたときに、読み込みを待たずにすぐ出すために使う。
const pageCache = new Map()

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

  const location = useLocation()
  const goBack = useGoBack('/color')

  const loadKey =
    `${slug}:${requestedYear}:${view}`

  const [state, setState] =
    useState(
      () =>
        pageCache.get(loadKey) || {
          status: 'loading',
          key: '',
          magazine: null,
          year: 0,
          index: null,
          seriesGroups: [],
          fromCache: false,
          error: ''
        }
    )

  const [issueInput, setIssueInput] =
    useState('')
  const [yearInput, setYearInput] =
    useState('')
  const [formError, setFormError] =
    useState('')

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
        pageCache.set(next.key, next)

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

  useScrollRestore(
    location.key,
    state.status !== 'loading' &&
      !isSwitching
  )

  // 右上のメニュー（切り落としの設定、名前とフォルダ名）
  const [isMenuOpen, setIsMenuOpen] =
    useState(false)

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
      <div className="color-sticky-header">
        <div className="series-page-header">
          <button
            className="back-button"
            onClick={goBack}
          >
            ← 戻る
          </button>

          <div className="title series-page-title">
            {state.magazine?.name ||
              'カラーページ'}
          </div>

          {state.status === 'ready' &&
          !state.fromCache ? (
            <button
              type="button"
              className="page-settings-button color-header-menu-button"
              aria-label="雑誌の設定"
              onClick={() =>
                setIsMenuOpen(true)
              }
            >
              <AppIcon name="settings" />
            </button>
          ) : (
            <div />
          )}
        </div>

        {state.status === 'ready' && (
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
        )}

        {state.status === 'ready' &&
          view === 'issues' && (
            <label className="color-toolbar-field">
              <span>年</span>
              <select
                value={state.year}
                onChange={(event) =>
                  openYear(event.target.value)
                }
              >
                {yearOptions.map((year) => (
                  <option
                    key={year}
                    value={year}
                  >
                    {year}年
                  </option>
                ))}
              </select>
            </label>
          )}

        {state.status === 'ready' &&
          view === 'series' && (
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
          )}
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

          {/* 号の一覧を作れない雑誌（ジャンプ以外）は、年と号を入力して開く */}
          {view === 'issues' && !range && (
            <div className="color-toolbar">
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

              <form
                className="color-toolbar-field"
                onSubmit={openIssue}
              >
                <span>号を開く</span>
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
            </div>
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
              <div className="grid color-series-grid">
                {seriesGroups.map((group) => (
                  <button
                    key={group.title}
                    type="button"
                    className={`card ${
                      group.status === 'completed'
                        ? 'completed'
                        : ''
                    }`}
                    onClick={() =>
                      navigate(
                        `/color/${slug}/series/${encodeURIComponent(
                          group.title
                        )}`
                      )
                    }
                  >
                    <div className="cover">
                      <ImageView
                        imageId={group.imageId}
                        fallbackImage={group.image}
                      />
                    </div>

                    <div className="card-title">
                      {group.title}
                    </div>

                    {group.startLabel && (
                      <div className="card-start-issue">
                        <span className="card-start-label">
                          開始
                        </span>
                        <span>
                          {group.startLabel}
                        </span>
                      </div>
                    )}

                    <div className="card-issue">
                      {group.count > 0
                        ? `${group.count}枚`
                        : '画像なし'}
                    </div>

                    <div className="card-unread">
                      {group.duration ||
                        '期間未設定'}
                    </div>
                  </button>
                ))}
              </div>
            )}

          {view === 'series' && (
            <div
              className="bottom-nav series-bottom-nav color-series-footer"
              role="radiogroup"
              aria-label="絞り込み"
            >
              {SERIES_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={
                    filter === item.id
                  }
                  className="series-visibility-switch"
                  onClick={() =>
                    updateSearch({
                      f: item.id
                    })
                  }
                >
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {isMenuOpen &&
        state.status === 'ready' && (
          <div
            className="series-picker"
            role="dialog"
            aria-modal="true"
            aria-label="雑誌の設定"
          >
            <div className="series-picker-panel">
              <div className="series-picker-header">
                <span />
                <strong>雑誌の設定</strong>
                <button
                  type="button"
                  className="cloud-settings-secondary"
                  onClick={() =>
                    setIsMenuOpen(false)
                  }
                >
                  閉じる
                </button>
              </div>

              <div className="color-menu-body">
                <CropSettings
                  key={`crop-${state.magazine.slug}`}
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

                <MagazineRename
                  key={`rename-${state.magazine.slug}`}
                  magazine={state.magazine}
                  onRenamed={(magazine) => {
                    if (!magazine) {
                      return
                    }

                    if (magazine.slug !== slug) {
                      setIsMenuOpen(false)
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
              </div>
            </div>
          </div>
        )}
    </div>
  )
}

export default ColorMagazinePage
