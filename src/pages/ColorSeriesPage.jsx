import { useEffect, useState } from 'react'
import {
  useParams,
  useSearchParams
} from 'react-router-dom'
import CloudImage from '../components/CloudImage'
import {
  useGoBack,
  useScrollTopOnOpen
} from '../hooks/useScrollHeader'
import ColorViewer from '../components/ColorViewer'
import {
  loadRootIndex,
  loadYearIndexes
} from '../utils/colorStore'
import {
  PINNED_TAGS,
  SERIES_STATUS_LABELS,
  describeSeriesPeriod,
  findAppMagazine
} from '../utils/colorCatalog'
import {
  formatIssueFolder,
  SERIES_IMAGE_SORTS,
  SERIES_IMAGE_KINDS,
  arrangeSeriesImages,
  hideSpreadPages,
  getKindLabel,
  isSpreadSize,
  normalizeKind,
  listSeriesImages,
  normalizeSlug,
  thumbKey
} from '../utils/colorLibrary'

// 1つの作品のタグが付いたカラーページを並べる（並べ順は選べる）
function ColorSeriesPage({
  magazineList,
  seriesList
}) {
  const params = useParams()
  const [searchParams, setSearchParams] =
    useSearchParams()

  useScrollTopOnOpen()

  const sort =
    SERIES_IMAGE_SORTS.some(
      (item) =>
        item.id === searchParams.get('s')
    )
      ? searchParams.get('s')
      : 'old'

  const kind =
    SERIES_IMAGE_KINDS.some(
      (item) =>
        item.id === searchParams.get('k')
    )
      ? searchParams.get('k')
      : 'all'

  const updateParams = (next) => {
    const merged = { s: sort, k: kind, ...next }
    const query = {}

    if (merged.s !== 'old') {
      query.s = merged.s
    }

    if (merged.k !== 'all') {
      query.k = merged.k
    }

    setViewerIndex(null)
    setSearchParams(query, { replace: true })
  }

  const slug = normalizeSlug(params.slug)

  const goBack =
    useGoBack(
      slug
        ? `/color/${slug}?v=series`
        : '/color'
    )
  const title =
    String(params.title || '').trim()

  const [state, setState] =
    useState({
      status: 'loading',
      images: [],
      fromCache: false,
      error: ''
    })

  const [viewerIndex, setViewerIndex] =
    useState(null)

  // ビューアーには見開きのページも含めて渡し、一覧では見開きだけを出す
  const images =
    arrangeSeriesImages(
      state.images,
      sort,
      kind
    )

  const gridImages = hideSpreadPages(images)

  useEffect(() => {
    if (!slug || !title) {
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

      const result =
        await loadYearIndexes(
          slug,
          magazine.years
        )

      return {
        status: 'ready',
        magazine,
        images: listSeriesImages(
          result.indexes,
          title
        ),
        fromCache:
          rootResult.fromCache ||
          result.fromCache,
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
            images: [],
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
  }, [slug, title])

  // アプリに登録されている同じ名前の作品（連載期間の表示用）
  const appMagazine =
    findAppMagazine(
      state.magazine,
      magazineList
    )

  const series =
    appMagazine
      ? seriesList.find(
          (item) =>
            item.magazineId ===
              appMagazine.id &&
            String(item.title || '').trim() ===
              title
        )
      : null

  return (
    <div className="app color-wide">
      <div className="series-page-header">
        <button
          className="back-button"
          onClick={goBack}
        >
          ← 戻る
        </button>

        <div className="title series-page-title">
          {title || 'カラーページ'}
        </div>

        <div />
      </div>

      {(!slug || !title) && (
        <div className="color-notice error">
          <p>ページが見つかりません。</p>
        </div>
      )}

      {slug &&
        title &&
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

          {series && (
            <p className="color-series-row-meta">
              <span
                className={`color-status-badge ${series.status || 'ongoing'}`}
              >
                {SERIES_STATUS_LABELS[
                  series.status
                ] || '連載中'}
              </span>
              {describeSeriesPeriod(
                series,
                appMagazine
              )}
            </p>
          )}

          {!series &&
            PINNED_TAGS.includes(title) && (
              <p className="color-series-row-meta">
                <span className="color-status-badge oneshot">
                  {title}
                </span>
              </p>
            )}

          {state.images.length === 0 && (
            <div className="empty-message">
              この作品のタグが付いた画像はありません。
            </div>
          )}

          {state.images.length > 1 && (
            <div className="color-series-toolbar">
              <label className="color-toolbar-field">
                <span>並べ順</span>
                <select
                  value={sort}
                  onChange={(event) =>
                    updateParams({
                      s: event.target.value
                    })
                  }
                >
                  {SERIES_IMAGE_SORTS.map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="color-toolbar-field">
                <span>種類</span>
                <select
                  value={kind}
                  onChange={(event) =>
                    updateParams({
                      k: event.target.value
                    })
                  }
                >
                  {SERIES_IMAGE_KINDS.map((item) => (
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

          {state.images.length > 0 &&
            images.length === 0 && (
              <div className="empty-message">
                この種類の画像はありません。
              </div>
            )}

          <div className="color-image-grid">
            {gridImages.map(
              (image) => (
                <div
                  key={`${image.year}/${image.folder}/${image.file}`}
                  className={
                    isSpreadSize(image)
                      ? 'color-image-card spread'
                      : 'color-image-card'
                  }
                >
                  <button
                    type="button"
                    style={
                      isSpreadSize(image)
                        ? {
                            aspectRatio: `${image.width} / ${image.height}`
                          }
                        : undefined
                    }
                    className="color-thumb"
                    aria-label={`${image.year}年 ${formatIssueFolder(
                      image.folder
                    )} を全画面で表示`}
                    onClick={() =>
                      setViewerIndex(
                        images.indexOf(image)
                      )
                    }
                  >
                    <CloudImage
                      imageKey={thumbKey(
                        slug,
                        image.year,
                        image.folder,
                        image.file
                      )}
                      alt=""
                    />
                  </button>

                  <span className="color-kind-badge">
                    {getKindLabel(
                      normalizeKind(image.kind)
                    )}
                  </span>

                  <span className="color-series-line">
                    {image.year}年{' '}
                    {formatIssueFolder(
                      image.folder
                    )}
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {viewerIndex !== null &&
        images.length > 0 && (
          <ColorViewer
            slug={slug}
            images={images}
            initialIndex={viewerIndex}
            onClose={() =>
              setViewerIndex(null)
            }
          />
        )}
    </div>
  )
}

export default ColorSeriesPage
