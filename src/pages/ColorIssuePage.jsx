import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import CloudImage from '../components/CloudImage'
import ColorViewer from '../components/ColorViewer'
import prepareImage from '../utils/prepareImage'
import {
  deleteImageFiles,
  loadYearIndex,
  updateYearIndex,
  uploadImages
} from '../utils/colorStore'
import {
  IMAGE_KINDS,
  formatIssueFolder,
  getKindLabel,
  moveImageInIssue,
  normalizeSlug,
  normalizeYear,
  parseIssueFolder,
  removeImageFromIssue,
  setImageKindInIssue,
  thumbKey
} from '../utils/colorLibrary'

// 1回に選べる枚数。選び間違いで大量に送ってしまうのを防ぐ。
const MAX_FILES_PER_BATCH = 30

function ColorIssuePage({ navigate }) {
  const params = useParams()

  const slug = normalizeSlug(params.slug)
  const year = normalizeYear(params.year)
  const folder =
    parseIssueFolder(params.issue)
      ? params.issue
      : ''

  const isValid =
    Boolean(slug && year && folder)

  const [state, setState] =
    useState({
      status: 'loading',
      index: null,
      fromCache: false,
      error: ''
    })

  const [busy, setBusy] = useState('')
  const [message, setMessage] =
    useState(null)
  const [isEditing, setIsEditing] =
    useState(false)
  const [viewerIndex, setViewerIndex] =
    useState(null)

  useEffect(() => {
    if (!isValid) {
      return undefined
    }

    let active = true

    loadYearIndex(slug, year)
      .then((result) => {
        if (active) {
          setState({
            status: 'ready',
            index: result.index,
            fromCache: result.fromCache,
            error: ''
          })
        }
      })
      .catch((error) => {
        if (active) {
          setState({
            status: 'error',
            index: null,
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
  }, [isValid, slug, year])

  const images =
    state.index?.issues[folder]?.images ||
    []

  const canChange =
    state.status === 'ready' &&
    !state.fromCache &&
    !busy

  const setIndex = (index) => {
    setState({
      status: 'ready',
      index,
      fromCache: false,
      error: ''
    })
  }

  const handleFiles = async (
    event,
    kind
  ) => {
    const files =
      Array.from(event.target.files || [])

    event.target.value = ''

    if (files.length === 0) {
      return
    }

    if (
      files.length > MAX_FILES_PER_BATCH
    ) {
      setMessage({
        type: 'error',
        text: `一度に選べるのは ${MAX_FILES_PER_BATCH} 枚までです。`
      })
      return
    }

    setMessage(null)

    try {
      const prepared = []

      for (const file of files) {
        setBusy(
          `準備中 ${prepared.length + 1} / ${files.length}`
        )
        prepared.push(
          await prepareImage(file)
        )
      }

      setBusy(
        `送信中 0 / ${prepared.length}`
      )

      const result =
        await uploadImages({
          slug,
          year,
          folder,
          kind,
          prepared,
          onProgress: (done) => {
            setBusy(
              `送信中 ${done} / ${prepared.length}`
            )
          }
        })

      if (result.index) {
        setIndex(result.index)
      }

      if (result.failure) {
        setMessage({
          type: 'error',
          text: `${prepared.length} 枚中 ${result.added.length} 枚を登録しました。残りは失敗しました: ${
            result.failure.message || ''
          }`
        })
      } else {
        setMessage({
          type: 'ok',
          text: `${result.added.length} 枚を登録しました。`
        })
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error?.message ||
          '登録できませんでした。'
      })
    } finally {
      setBusy('')
    }
  }

  const change = async (label, update) => {
    setBusy(label)
    setMessage(null)

    try {
      setIndex(
        await updateYearIndex(
          slug,
          year,
          update
        )
      )
      return true
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error?.message ||
          '保存できませんでした。'
      })
      return false
    } finally {
      setBusy('')
    }
  }

  const handleDelete = async (image) => {
    const ok =
      window.confirm(
        `${getKindLabel(
          image.kind
        )}の画像を削除しますか？クラウドからも消え、元に戻せません。`
      )

    if (!ok) {
      return
    }

    // 先に一覧から外す。ファイルの削除に失敗しても、
    // 表示が壊れた状態（一覧にあるのに画像がない）にはならない。
    const removed =
      await change('削除中', (current) =>
        removeImageFromIssue(
          current,
          folder,
          image.file
        )
      )

    if (!removed) {
      return
    }

    try {
      await deleteImageFiles(
        slug,
        year,
        folder,
        image.file
      )
    } catch (error) {
      console.error(error)
      setMessage({
        type: 'error',
        text: '一覧からは外しましたが、クラウド上のファイルを消せませんでした。'
      })
    }
  }

  return (
    <div className="app">
      <div className="series-page-header">
        <button
          className="back-button"
          onClick={() =>
            navigate(
              slug && year
                ? `/color/${slug}?y=${year}`
                : '/color'
            )
          }
        >
          ← 戻る
        </button>

        <div className="title series-page-title">
          {isValid
            ? `${year}年 ${formatIssueFolder(
                folder
              )}`
            : 'カラーページ'}
        </div>

        {images.length > 0 ? (
          <button
            type="button"
            className="mode-button"
            aria-pressed={isEditing}
            disabled={
              !canChange && !isEditing
            }
            onClick={() =>
              setIsEditing(!isEditing)
            }
          >
            {isEditing ? '完了' : '編集'}
          </button>
        ) : (
          <div />
        )}
      </div>

      {!isValid && (
        <div className="color-notice error">
          <p>ページが見つかりません。</p>
        </div>
      )}

      {isValid &&
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
                通信できないため、前回の内容を表示しています。登録や編集はできません。
              </p>
            </div>
          )}

          {!state.fromCache && (
            <div className="color-add">
              <span>画像を追加</span>
              <div className="color-chip-row">
                {IMAGE_KINDS.map((kind) => (
                  <label
                    key={kind.id}
                    className={
                      canChange
                        ? 'color-chip'
                        : 'color-chip disabled'
                    }
                  >
                    {kind.label}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={!canChange}
                      onChange={(event) =>
                        handleFiles(
                          event,
                          kind.id
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {busy && (
            <div
              className="cloud-settings-message"
              role="status"
            >
              {busy}
            </div>
          )}

          {message && (
            <div
              className={
                message.type === 'error'
                  ? 'cloud-settings-message error'
                  : 'cloud-settings-message'
              }
              role="status"
            >
              {message.text}
            </div>
          )}

          {images.length === 0 && (
            <div className="empty-message">
              この号の画像はまだありません。上のボタンから、種類を選んで追加してください。
            </div>
          )}

          <div className="color-image-grid">
            {images.map((image, position) => (
              <div
                key={image.file}
                className="color-image-card"
              >
                <button
                  type="button"
                  className="color-thumb"
                  aria-label={`${getKindLabel(
                    image.kind
                  )}を全画面で表示`}
                  onClick={() =>
                    setViewerIndex(position)
                  }
                >
                  <CloudImage
                    imageKey={thumbKey(
                      slug,
                      year,
                      folder,
                      image.file
                    )}
                    alt=""
                  />
                </button>

                {!isEditing && (
                  <span className="color-kind-badge">
                    {getKindLabel(
                      image.kind
                    )}
                  </span>
                )}

                {isEditing && (
                  <div className="color-edit-controls">
                    <select
                      aria-label="種類"
                      value={image.kind}
                      disabled={!canChange}
                      onChange={(event) =>
                        change(
                          '保存中',
                          (current) =>
                            setImageKindInIssue(
                              current,
                              folder,
                              image.file,
                              event.target
                                .value
                            )
                        )
                      }
                    >
                      {IMAGE_KINDS.map(
                        (kind) => (
                          <option
                            key={kind.id}
                            value={kind.id}
                          >
                            {kind.label}
                          </option>
                        )
                      )}
                    </select>

                    <div className="color-edit-row">
                      <button
                        type="button"
                        aria-label="前へ移動"
                        disabled={
                          !canChange ||
                          position === 0
                        }
                        onClick={() =>
                          change(
                            '保存中',
                            (current) =>
                              moveImageInIssue(
                                current,
                                folder,
                                image.file,
                                -1
                              )
                          )
                        }
                      >
                        ←
                      </button>

                      <button
                        type="button"
                        aria-label="後ろへ移動"
                        disabled={
                          !canChange ||
                          position ===
                            images.length - 1
                        }
                        onClick={() =>
                          change(
                            '保存中',
                            (current) =>
                              moveImageInIssue(
                                current,
                                folder,
                                image.file,
                                1
                              )
                          )
                        }
                      >
                        →
                      </button>

                      <button
                        type="button"
                        className="color-delete"
                        disabled={!canChange}
                        onClick={() =>
                          handleDelete(image)
                        }
                      >
                        削除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {viewerIndex !== null &&
        images.length > 0 && (
          <ColorViewer
            slug={slug}
            year={year}
            folder={folder}
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

export default ColorIssuePage
