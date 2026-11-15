import { useEffect, useState } from 'react'
import {
  useParams,
  useSearchParams
} from 'react-router-dom'
import CloudImage from '../components/CloudImage'
import CropSettings from '../components/CropSettings'
import {
  loadRootIndex,
  loadYearIndex,
  loadYearIndexes
} from '../utils/colorStore'
import {
  collectSeries,
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

function ColorMagazinePage({ navigate }) {
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

      const year =
        requestedYear ||
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
  }, [slug, requestedYear, view, loadKey])

  const isSwitching =
    state.status === 'ready' &&
    state.key !== loadKey

  const yearOptions =
    state.magazine
      ? Array.from(
          new Set([
            ...state.magazine.years,
            state.year,
            new Date().getFullYear()
          ])
        ).sort((a, b) => b - a)
      : []

  const issues =
    state.index
      ? listIssues(state.index).reverse()
      : []

  const updateSearch = (changes) => {
    const next = {}

    const year =
      changes.y ?? (state.year || '')

    const nextView = changes.v ?? view

    if (year) {
      next.y = String(year)
    }

    if (nextView === 'series') {
      next.v = 'series'
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
                      className="color-issue-card"
                      onClick={() =>
                        navigate(
                          `/color/${slug}/${state.year}/${issue.folder}`
                        )
                      }
                    >
                      <div className="color-thumb">
                        <CloudImage
                          imageKey={thumbKey(
                            slug,
                            state.year,
                            issue.folder,
                            cover.file
                          )}
                          alt=""
                        />
                      </div>
                      <span className="color-issue-label">
                        {formatIssueFolder(
                          issue.folder
                        )}
                      </span>
                      <small>
                        {issue.images.length}枚
                      </small>
                    </button>
                  )
                })}
              </div>
            )}

          {!isSwitching &&
            view === 'series' &&
            state.seriesGroups.length ===
              0 && (
              <div className="empty-message">
                作品タグの付いた画像はまだありません。号の画面で「編集」から付けられます。
              </div>
            )}

          {!isSwitching &&
            view === 'series' && (
              <div className="color-issue-grid">
                {state.seriesGroups.map(
                  (group) => (
                    <button
                      key={group.title}
                      type="button"
                      className="color-issue-card"
                      onClick={() =>
                        navigate(
                          `/color/${slug}/series/${encodeURIComponent(
                            group.title
                          )}`
                        )
                      }
                    >
                      <div className="color-thumb">
                        <CloudImage
                          imageKey={thumbKey(
                            slug,
                            group.cover.year,
                            group.cover.folder,
                            group.cover.file
                          )}
                          alt=""
                        />
                      </div>
                      <span className="color-issue-label">
                        {group.title}
                      </span>
                      <small>
                        {group.count}枚
                      </small>
                    </button>
                  )
                )}
              </div>
            )}
        </div>
      )}
    </div>
  )
}

export default ColorMagazinePage
