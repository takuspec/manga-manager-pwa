import {
  useEffect,
  useRef,
  useState
} from 'react'
import { useParams } from 'react-router-dom'
import CloudImage from '../components/CloudImage'
import ColorViewer from '../components/ColorViewer'
import SeriesTagPicker from '../components/SeriesTagPicker'
import prepareImage from '../utils/prepareImage'
import {
  findAppMagazine,
  listSeriesInIssue
} from '../utils/colorCatalog'
import {
  deleteImageFiles,
  getCachedRootIndex,
  loadRootIndex,
  loadYearIndex,
  updateYearIndex,
  uploadImages
} from '../utils/colorStore'
import {
  IMAGE_KINDS,
  formatIssueFolder,
  getImageLabel,
  getKindLabel,
  isSpreadSize,
  moveImageInIssue,
  normalizeSlug,
  normalizeYear,
  parseIssueFolder,
  removeImageFromIssue,
  setImageKindInIssue,
  setImageSeriesInIssue,
  suggestKinds,
  thumbKey
} from '../utils/colorLibrary'

// 1回に選べる枚数。選び間違いで大量に送ってしまうのを防ぐ。
const MAX_FILES_PER_BATCH = 30

// カラーページの雑誌に対応する、アプリ側の雑誌
function getAppMagazine(magazineList, slug) {
  return findAppMagazine(
    getCachedRootIndex()?.magazines.find(
      (magazine) => magazine.slug === slug
    ),
    magazineList
  )
}

// 作品タグの候補。この雑誌の作品を先に、ほかの雑誌の作品を後ろに並べる。
function buildSeriesChoices(
  seriesList,
  magazineList,
  slug
) {
  const localMagazineId =
    getAppMagazine(magazineList, slug)?.id

  const byTitle = (a, b) =>
    a.localeCompare(b, 'ja')

  const titlesOf = (list) =>
    list
      .map((series) =>
        String(series.title || '').trim()
      )
      .filter(Boolean)
      .sort(byTitle)

  const own =
    titlesOf(
      seriesList.filter(
        (series) =>
          series.magazineId ===
          localMagazineId
      )
    )

  const others =
    titlesOf(
      seriesList.filter(
        (series) =>
          series.magazineId !==
          localMagazineId
      )
    )

  return Array.from(
    new Set([...own, ...others])
  )
}

function ColorIssuePage({
  seriesList,
  magazineList,
  navigate
}) {
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

  // 選んだ画像の、登録前の確認用の一覧
  const [pending, setPending] =
    useState(null)

  // 作品タグを選んでいる対象
  // { type: 'pending', id } または { type: 'saved', file }
  const [tagTarget, setTagTarget] =
    useState(null)

  const pendingFilesRef = useRef([])
  const previewUrlsRef = useRef([])

  const releasePreviews = () => {
    previewUrlsRef.current.forEach((url) => {
      URL.revokeObjectURL(url)
    })
    previewUrlsRef.current = []
  }

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach(
        (url) => {
          URL.revokeObjectURL(url)
        }
      )
      previewUrlsRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!isValid) {
      return undefined
    }

    let active = true

    // 切り落としの固定値と作品タグの候補に、雑誌の一覧を使う。
    // 雑誌の画面を通ってきていれば読み込み済みなので、通信しない。
    if (!getCachedRootIndex()) {
      loadRootIndex().catch((error) => {
        console.error(error)
      })
    }

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

  const clearPending = () => {
    releasePreviews()
    pendingFilesRef.current = []
    setPending(null)
  }

  // 選んだ画像を登録用に整え、確認用の一覧を作る。
  // keep を渡すと、種類と作品タグは前の一覧のものを引き継ぐ
  // （切り落としの設定だけを変えてやり直すとき）。
  const buildPending = async (
    files,
    trim,
    keep
  ) => {
    setMessage(null)

    try {
      const prepared = []

      // この雑誌に固定の切り落とし範囲があれば、それを使う
      const crops =
        getCachedRootIndex()?.magazines.find(
          (magazine) =>
            magazine.slug === slug
        )?.crops

      for (const file of files) {
        setBusy(
          `準備中 ${prepared.length + 1} / ${files.length}`
        )
        prepared.push(
          await prepareImage(file, {
            trim,
            crops
          })
        )
      }

      const kinds =
        suggestKinds(prepared, {
          hasCover: images.some(
            (image) =>
              image.kind === 'cover'
          ),
          hasOpening: images.some(
            (image) =>
              image.kind === 'opening'
          )
        })

      releasePreviews()

      const items =
        prepared.map((item, position) => {
          const previewUrl =
            URL.createObjectURL(item.thumb)

          previewUrlsRef.current.push(
            previewUrl
          )

          return {
            id: `${Date.now()}-${position}`,
            prepared: item,
            previewUrl,
            kind:
              keep?.[position]?.kind ||
              kinds[position],
            series:
              keep?.[position]?.series || []
          }
        })

      pendingFilesRef.current = files
      setPending({
        trim,
        items
      })
    } catch (error) {
      console.error(error)
      setMessage({
        type: 'error',
        text: '画像を読み込めませんでした。別の画像で試してください。'
      })
    } finally {
      setBusy('')
    }
  }

  const handleFiles = (event) => {
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

    buildPending(files, true, null)
  }

  const updatePendingItem = (id, patch) => {
    setPending((current) => {
      return current
        ? {
            ...current,
            items: current.items.map(
              (item) =>
                item.id === id
                  ? {
                      ...item,
                      ...patch
                    }
                  : item
            )
          }
        : current
    })
  }

  const removePendingItem = (id) => {
    const position =
      pending.items.findIndex(
        (item) => item.id === id
      )

    if (position < 0) {
      return
    }

    pendingFilesRef.current =
      pendingFilesRef.current.filter(
        (_, index) => index !== position
      )

    const items =
      pending.items.filter(
        (item) => item.id !== id
      )

    if (items.length === 0) {
      clearPending()
      return
    }

    setPending({
      ...pending,
      items
    })
  }

  const handleRegister = async () => {
    const items = pending.items

    setMessage(null)
    setBusy(`送信中 0 / ${items.length}`)

    try {
      const result =
        await uploadImages({
          slug,
          year,
          folder,
          prepared: items.map((item) => ({
            ...item.prepared,
            kind: item.kind,
            series: item.series
          })),
          onProgress: (done) => {
            setBusy(
              `送信中 ${done} / ${items.length}`
            )
          }
        })

      if (result.index) {
        setIndex(result.index)
      }

      if (result.failure) {
        // 送れなかった分だけを確認用の一覧に残す
        const done = result.added.length

        pendingFilesRef.current =
          pendingFilesRef.current.slice(done)

        setPending({
          ...pending,
          items: items.slice(done)
        })

        setMessage({
          type: 'error',
          text: `${items.length} 枚中 ${done} 枚を登録しました。残りは失敗しました: ${
            result.failure.message || ''
          }`
        })
      } else {
        clearPending()
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

  const tagValue =
    tagTarget?.type === 'pending'
      ? pending?.items.find(
          (item) => item.id === tagTarget.id
        )?.series
      : images.find(
          (image) =>
            image.file === tagTarget?.file
        )?.series

  const handleTagsDone = (series) => {
    const target = tagTarget

    setTagTarget(null)

    if (target.type === 'pending') {
      updatePendingItem(target.id, {
        series
      })
      return
    }

    change('保存中', (current) =>
      setImageSeriesInIssue(
        current,
        folder,
        target.file,
        series
      )
    )
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

          {!state.fromCache && !pending && (
            <label
              className={
                canChange
                  ? 'image-size-test-pick'
                  : 'image-size-test-pick disabled'
              }
            >
              画像をまとめて追加
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={!canChange}
                onChange={handleFiles}
              />
            </label>
          )}

          {pending && (
            <section className="cloud-settings-section">
              <h2>
                登録する内容の確認（
                {pending.items.length}枚）
              </h2>

              <label className="color-check">
                <input
                  type="checkbox"
                  checked={pending.trim}
                  disabled={Boolean(busy)}
                  onChange={(event) =>
                    buildPending(
                      pendingFilesRef.current,
                      event.target.checked,
                      pending.items
                    )
                  }
                />
                上部のバーと余白を切り落とす
              </label>

              <div className="color-pending-list">
                {pending.items.map((item) => (
                  <div
                    key={item.id}
                    className="color-pending-item"
                  >
                    <div className="color-thumb">
                      <img
                        src={item.previewUrl}
                        alt=""
                      />
                    </div>

                    <div className="color-pending-fields">
                      <select
                        aria-label="種類"
                        value={item.kind}
                        disabled={Boolean(busy)}
                        onChange={(event) =>
                          updatePendingItem(
                            item.id,
                            {
                              kind:
                                event.target
                                  .value
                            }
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

                      <button
                        type="button"
                        className="cloud-settings-secondary"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          setTagTarget({
                            type: 'pending',
                            id: item.id
                          })
                        }
                      >
                        {item.series.length > 0
                          ? item.series.join('、')
                          : '作品タグを付ける'}
                      </button>

                      <small>
                        {isSpreadSize(item.prepared)
                          ? '見開き'
                          : '縦'}
                        ・{item.prepared.width} ×{' '}
                        {item.prepared.height}px
                        {item.prepared.trimmed
                          ? item.prepared
                              .trimMode === 'fixed'
                            ? '（固定の範囲で切り落とし）'
                            : '（自動判定で切り落とし）'
                          : ''}
                      </small>

                      <button
                        type="button"
                        className="color-pending-remove"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          removePendingItem(
                            item.id
                          )
                        }
                      >
                        この画像は登録しない
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="cloud-settings-actions">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={handleRegister}
                >
                  {pending.items.length}
                  枚を登録
                </button>

                <button
                  type="button"
                  className="cloud-settings-secondary"
                  disabled={Boolean(busy)}
                  onClick={clearPending}
                >
                  やめる
                </button>
              </div>
            </section>
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

          {images.length === 0 &&
            !pending && (
              <div className="empty-message">
                この号の画像はまだありません。上のボタンから、その号の画像をまとめて選んでください。
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
                  aria-label={`${getImageLabel(
                    image
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

                <span className="color-kind-badge">
                  {getImageLabel(image)}
                </span>

                {!isEditing &&
                  image.series.length > 0 && (
                    <span className="color-series-line">
                      {image.series.join('、')}
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

                    <button
                      type="button"
                      className="cloud-settings-secondary"
                      disabled={!canChange}
                      onClick={() =>
                        setTagTarget({
                          type: 'saved',
                          file: image.file
                        })
                      }
                    >
                      {image.series.length > 0
                        ? image.series.join('、')
                        : '作品タグを付ける'}
                    </button>

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

      {tagTarget && (
        <SeriesTagPicker
          choices={buildSeriesChoices(
            seriesList,
            magazineList,
            slug
          )}
          featured={listSeriesInIssue(
            seriesList,
            getAppMagazine(
              magazineList,
              slug
            ),
            year,
            folder
          )}
          value={tagValue || []}
          onDone={handleTagsDone}
          onCancel={() =>
            setTagTarget(null)
          }
        />
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
