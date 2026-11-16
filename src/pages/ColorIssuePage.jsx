import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import { useParams } from 'react-router-dom'
import {
  useGoBack,
  useScrollTopOnOpen
} from '../hooks/useScrollHeader'
import CloudImage from '../components/CloudImage'
import ColorViewer from '../components/ColorViewer'
import SeriesTagPicker from '../components/SeriesTagPicker'
import prepareImage from '../utils/prepareImage'
import uploadQueue from '../utils/uploadQueue'
import {
  findAppMagazine,
  listSeriesInIssue
} from '../utils/colorCatalog'
import {
  deleteImageFiles,
  getCachedRootIndex,
  loadRootIndex,
  loadYearIndex,
  updateYearIndex
} from '../utils/colorStore'
import {
  IMAGE_KINDS,
  formatIssueFolder,
  getKindLabel,
  groupColorPieces,
  isSpreadSize,
  matchSpreadPages,
  moveImageInIssue,
  normalizeKind,
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
  magazineList
}) {
  const params = useParams()

  useScrollTopOnOpen()

  const slug = normalizeSlug(params.slug)
  const year = normalizeYear(params.year)
  const folder =
    parseIssueFolder(params.issue)
      ? params.issue
      : ''

  const isValid =
    Boolean(slug && year && folder)

  const goBack =
    useGoBack(
      slug && year
        ? `/color/${slug}?y=${year}`
        : '/color'
    )

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

  // 裏で送っている画像のうち、この号の分
  const queueState =
    useSyncExternalStore(
      uploadQueue.subscribe,
      uploadQueue.getSnapshot
    )

  const queueKey = `${slug}/${year}/${folder}`

  const queuedHere =
    queueState.batches.filter(
      (batch) =>
        batch.slug === slug &&
        batch.year === year &&
        batch.folder === folder
    )

  const queuedCount =
    queuedHere
      .filter(
        (batch) => batch.status !== 'error'
      )
      .reduce(
        (total, batch) => total + batch.count,
        0
      )

  const failedHere =
    queuedHere.filter(
      (batch) => batch.status === 'error'
    )

  const finishedCount =
    queueState.finished[queueKey] || 0

  // この号の送信が終わったら、一覧を読み直して登録した画像を出す
  useEffect(() => {
    if (!isValid || finishedCount === 0) {
      return undefined
    }

    let active = true

    loadYearIndex(slug, year)
      .then((result) => {
        if (active && !result.fromCache) {
          setState({
            status: 'ready',
            index: result.index,
            fromCache: false,
            error: ''
          })
        }
      })
      .catch((error) => {
        console.error(error)
      })

    return () => {
      active = false
    }
  }, [isValid, slug, year, finishedCount])

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

      // 見開きと、その各ページ（撮った場合）を画像の中身で対応づける
      const stamp = Date.now()

      const analyzed =
        prepared.map((item, position) => ({
          id: `${stamp}-${position}`,
          width: item.width,
          height: item.height,
          signature: item.signature
        }))

      const pages =
        matchSpreadPages(analyzed)

      const withPages =
        analyzed.map((item) => ({
          ...item,
          spreadId: pages.get(item.id) || null
        }))

      const kinds =
        suggestKinds(withPages, {
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
            id: withPages[position].id,
            spreadId:
              withPages[position].spreadId,
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

  // 登録前の並び替え。選んだ順が撮った順と違うときに直す
  const movePendingItem = (id, delta) => {
    const from =
      pending.items.findIndex(
        (item) => item.id === id
      )

    const to = from + delta

    if (
      from < 0 ||
      to < 0 ||
      to >= pending.items.length
    ) {
      return
    }

    const move = (list) => {
      const next = [...list]
      const [moved] = next.splice(from, 1)

      next.splice(to, 0, moved)
      return next
    }

    // 切り落としをやり直すときに順番がずれないよう、元のファイルも同じく並べ替える
    pendingFilesRef.current =
      move(pendingFilesRef.current)

    setPending({
      ...pending,
      items: move(pending.items)
    })
  }

  // 今の並び順で、種類を付け直す
  const resuggestPendingKinds = () => {
    const kinds =
      suggestKinds(
        pending.items.map((item) => ({
          id: item.id,
          spreadId: item.spreadId,
          width: item.prepared.width,
          height: item.prepared.height
        })),
        {
          hasCover: images.some(
            (image) =>
              image.kind === 'cover'
          ),
          hasOpening: images.some(
            (image) =>
              image.kind === 'opening'
          )
        }
      )

    setPending({
      ...pending,
      items: pending.items.map(
        (item, position) => ({
          ...item,
          kind: kinds[position]
        })
      )
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

  // 画像を送信待ちの行列に入れて、すぐに次の登録へ進めるようにする。
  // 送信は裏で1件ずつ行い、終わるとこの号の一覧に出る。
  const handleRegister = async () => {
    const items = pending.items

    setMessage(null)

    try {
      await uploadQueue.enqueue({
        slug,
        year,
        folder,
        items: items.map((item) => ({
          ...item.prepared,
          kind: item.kind,
          series: item.series
        }))
      })

      clearPending()
      setMessage({
        type: 'ok',
        text: `${items.length} 枚の送信を始めました。終わるのを待たずに、ほかの号の登録へ進めます。`
      })
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error?.message ||
          '登録できませんでした。'
      })
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
      // 同じ組（巻頭カラーの4枚、センターカラーの見開きと各ページ）で、
      // まだタグが同じ（たいていは空）のものにも同じタグを付ける
      setPending((current) => {
        if (!current) {
          return current
        }

        const groups =
          groupColorPieces(
            current.items.map((item) => ({
              id: item.id,
              spreadId: item.spreadId,
              width: item.prepared.width,
              height: item.prepared.height,
              kind: item.kind
            }))
          )

        const position =
          current.items.findIndex(
            (item) => item.id === target.id
          )

        if (position < 0) {
          return current
        }

        const before =
          current.items[position].series.join('\n')

        return {
          ...current,
          items: current.items.map(
            (item, index) =>
              index === position ||
              (groups[index] ===
                groups[position] &&
                item.series.join('\n') ===
                  before)
                ? {
                    ...item,
                    series
                  }
                : item
          )
        }
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
          onClick={goBack}
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

              <p className="cloud-settings-note">
                種類は撮った順に自動で付けています。見開きの各ページは画像の中身から見分けて、見開きと同じ組にします。同じ組の画像には、まとめて作品タグが付きます。
              </p>

              <button
                type="button"
                className="cloud-settings-secondary"
                disabled={Boolean(busy)}
                onClick={resuggestPendingKinds}
              >
                今の並び順で種類を付け直す
              </button>

              <div className="color-pending-list">
                {pending.items.map((item, position) => (
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
                          : item.spreadId
                            ? '見開きのページ'
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

                      <div className="color-edit-row">
                        <button
                          type="button"
                          aria-label="前へ移動"
                          disabled={
                            Boolean(busy) ||
                            position === 0
                          }
                          onClick={() =>
                            movePendingItem(
                              item.id,
                              -1
                            )
                          }
                        >
                          ↑
                        </button>

                        <button
                          type="button"
                          aria-label="後ろへ移動"
                          disabled={
                            Boolean(busy) ||
                            position ===
                              pending.items.length - 1
                          }
                          onClick={() =>
                            movePendingItem(
                              item.id,
                              1
                            )
                          }
                        >
                          ↓
                        </button>
                      </div>

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

          {queuedCount > 0 && (
            <div
              className="cloud-settings-message"
              role="status"
            >
              この号の {queuedCount} 枚を送信しています。終わると下の一覧に出ます。
            </div>
          )}

          {failedHere.map((batch) => (
            <div
              key={batch.id}
              className="cloud-settings-message error"
              role="alert"
            >
              <span>
                {batch.count} 枚を送信できませんでした: {batch.error}
              </span>
              <div className="cloud-settings-actions">
                <button
                  type="button"
                  onClick={() =>
                    uploadQueue.retry(batch.id)
                  }
                >
                  もう一度送る
                </button>
                <button
                  type="button"
                  className="cloud-settings-secondary"
                  onClick={() => {
                    if (
                      window.confirm(
                        `送信できなかった ${batch.count} 枚を取り消しますか？`
                      )
                    ) {
                      uploadQueue.discard(batch.id)
                    }
                  }}
                >
                  取り消す
                </button>
              </div>
            </div>
          ))}

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
                className={
                  isSpreadSize(image)
                    ? 'color-image-card spread'
                    : 'color-image-card'
                }
              >
                <button
                  type="button"
                  className="color-thumb"
                  style={
                    isSpreadSize(image)
                      ? {
                          aspectRatio: `${image.width} / ${image.height}`
                        }
                      : undefined
                  }
                  aria-label={`${getKindLabel(
                    normalizeKind(image.kind)
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
                  {getKindLabel(
                    normalizeKind(image.kind)
                  )}
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
