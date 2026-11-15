import { useEffect, useState } from 'react'
import {
  useLocation,
  useParams
} from 'react-router-dom'
import CloudImage from '../components/CloudImage'
import ColorViewer from '../components/ColorViewer'
import {
  loadRootIndex,
  loadYearIndexes
} from '../utils/colorStore'
import {
  SERIES_STATUS_LABELS,
  describeSeriesPeriod,
  findAppMagazine
} from '../utils/colorCatalog'
import {
  formatIssueFolder,
  getImageLabel,
  listSeriesImages,
  normalizeSlug,
  thumbKey
} from '../utils/colorLibrary'

// 1つの作品のタグが付いたカラーページを、新しい号から順に並べる
function ColorSeriesPage({
  magazineList,
  seriesList,
  navigate
}) {
  const params = useParams()
  const location = useLocation()

  const slug = normalizeSlug(params.slug)
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
    <div className="app">
      <div className="series-page-header">
        <button
          className="back-button"
          onClick={() => {
            // 一覧から来たときは、絞り込みや並べ順を保ったまま戻る
            if (location.key !== 'default') {
              navigate(-1)
              return
            }

            navigate(
              slug
                ? `/color/${slug}?v=series`
                : '/color'
            )
          }}
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

          {state.images.length === 0 && (
            <div className="empty-message">
              この作品のタグが付いた画像はありません。
            </div>
          )}

          <div className="color-image-grid">
            {state.images.map(
              (image, position) => (
                <div
                  key={`${image.year}/${image.folder}/${image.file}`}
                  className="color-image-card"
                >
                  <button
                    type="button"
                    className="color-thumb"
                    aria-label={`${image.year}年 ${formatIssueFolder(
                      image.folder
                    )} を全画面で表示`}
                    onClick={() =>
                      setViewerIndex(position)
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
                    {getImageLabel(image)}
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
        state.images.length > 0 && (
          <ColorViewer
            slug={slug}
            images={state.images}
            initialIndex={viewerIndex}
            showIssue
            onClose={() =>
              setViewerIndex(null)
            }
          />
        )}
    </div>
  )
}

export default ColorSeriesPage
