import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import {
  useNavigate,
  useParams
} from 'react-router-dom'
import {
  useGoBack,
  useScrollTopOnOpen
} from '../hooks/useScrollHeader'
import CloudImage from '../components/CloudImage'
import ColorViewer from '../components/ColorViewer'
import SeriesTagPicker from '../components/SeriesTagPicker'
import prepareImage, {
  signatureFromBlob
} from '../utils/prepareImage'
import uploadQueue from '../utils/uploadQueue'
import { analyzePages } from '../utils/colorAi'
import {
  PINNED_TAGS,
  findAppMagazine,
  getCatalogRange,
  listSeriesInIssue
} from '../utils/colorCatalog'
import {
  buildIssueSequence,
  nextIssues,
  refineKindsBySeries,
  sortByShotOrder,
  unifySpreadSeries
} from '../utils/colorBulk'
import {
  deleteImageFiles,
  getCachedRootIndex,
  getImageBlob,
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
  hideSpreadPages,
  matchSpreadPages,
  moveImageInIssue,
  moveImageToInIssue,
  normalizeKind,
  normalizeSlug,
  normalizeYear,
  parseIssueFolder,
  removeImageFromIssue,
  setImageKindInIssue,
  setImageSeriesInIssue,
  setSpreadPagesInIssue,
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
  const navigate = useNavigate()

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

  // 編集中のドラッグでの並べ替え（file: 動かす画像、over: 指の下の画像）
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)

  const pendingFilesRef = useRef([])
  const batchRef = useRef(0)
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

  // 号を切り替えた直後は、前の年の一覧が残っていることがあるので年も確かめる
  const images =
    (state.index?.year === year &&
      state.index?.issues[folder]?.images) ||
    []

  // 前後の号（左右のスワイプで移る）
  const colorMagazine =
    getCachedRootIndex()?.magazines.find(
      (magazine) => magazine.slug === slug
    )

  const navMagazine =
    findAppMagazine(colorMagazine, magazineList)

  const issueSequence =
    buildIssueSequence(
      navMagazine,
      getCatalogRange(colorMagazine, navMagazine)
    )

  const prevIssue =
    isValid
      ? nextIssues(
          issueSequence,
          { year, folder },
          -1,
          2
        )[1]
      : null

  const nextIssue =
    isValid
      ? nextIssues(
          issueSequence,
          { year, folder },
          1,
          2
        )[1]
      : null

  const swipeRef = useRef(null)

  const canSwipe =
    !pending &&
    !isEditing &&
    viewerIndex === null &&
    !tagTarget

  const goToIssue = (issue) => {
    if (!issue) {
      return
    }

    setMessage(null)
    setViewerIndex(null)
    navigate(
      `/color/${slug}/${issue.year}/${issue.folder}`,
      { replace: true }
    )
    window.scrollTo(0, 0)
  }

  const handleTouchStart = (event) => {
    swipeRef.current =
      canSwipe && event.touches.length === 1
        ? {
            x: event.touches[0].clientX,
            y: event.touches[0].clientY,
            time: event.timeStamp
          }
        : null
  }

  // 右へはらうと次（新しい）の号、左へはらうと前（古い）の号
  // （右から左へめくる漫画と同じ向き）
  const handleTouchEnd = (event) => {
    const startTouch = swipeRef.current

    swipeRef.current = null

    if (!startTouch || !canSwipe) {
      return
    }

    const touch = event.changedTouches[0]
    const dx = touch.clientX - startTouch.x
    const dy = touch.clientY - startTouch.y

    if (
      Math.abs(dx) > 70 &&
      Math.abs(dx) > Math.abs(dy) * 2 &&
      event.timeStamp - startTouch.time < 700
    ) {
      goToIssue(dx > 0 ? nextIssue : prevIssue)
    }
  }

  // 見開きと、それを1ページずつ撮った画像は、一覧では見開きだけを出す
  // （全画面では3枚とも見られる）。編集中はすべて出す。
  const gridImages =
    isEditing
      ? images
      : hideSpreadPages(images)

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
      batchRef.current += 1
      const stamp = `b${batchRef.current}`

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

      // AI で作品タグを付け、目次を見分ける（切り落としのやり直しでは呼ばない）
      let finalItems = items
      let aiError = ''

      if (!keep) {
        setBusy('AI が作品を判定中…')

        const featured =
          listSeriesInIssue(
            seriesList,
            getAppMagazine(magazineList, slug),
            year,
            folder
          )

        const candidates = [
          ...PINNED_TAGS,
          ...(featured.length > 0
            ? featured
            : buildSeriesChoices(
                seriesList,
                magazineList,
                slug
              ).slice(0, 250))
        ]

        const result =
          await analyzePages({
            images: prepared,
            splitByCovers: false,
            magazine: colorMagazine?.name || '',
            candidatesFor: () => candidates,
            onProgress: (done, total) =>
              setBusy(
                `AI が判定中 ${done} / ${total}`
              )
          })

        aiError = result.error

        {
          finalItems =
            items.map((item, position) => {
              const series =
                result.series[position] || []

              return {
                ...item,
                skip:
                  result.types[position] ===
                  'toc',
                series,
                autoSeries: series.length > 0
              }
            })

          // 見開きと各ページは、同じ作品にそろえる
          const unified =
            unifySpreadSeries(finalItems)

          finalItems =
            finalItems.map((item, position) => ({
              ...item,
              series: unified[position],
              autoSeries:
                unified[position].length > 0
            }))

          // 表紙の作品と同じなら巻頭カラー、違えばセンターカラー
          const kept =
            finalItems.filter(
              (item) => !item.skip
            )

          const refined =
            refineKindsBySeries(
              kept.map((item) => ({
                id: item.id,
                spreadId: item.spreadId,
                series: item.series,
                kind: item.kind
              }))
            )

          const kindById = new Map(
            kept.map((item, position) => [
              item.id,
              refined[position]
            ])
          )

          finalItems =
            finalItems.map((item) =>
              kindById.has(item.id)
                ? {
                    ...item,
                    kind: kindById.get(item.id)
                  }
                : item
            )
        }
      }

      pendingFilesRef.current = files
      setPending({
        trim,
        items: finalItems
      })

      if (aiError) {
        setMessage({
          type: 'error',
          text: aiError
        })
      }
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
    // 撮った順に並べ直す（選んだ順が撮った順と違うことがあるため）
    const files =
      sortByShotOrder(event.target.files || [])

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
    // 目次など「保存しない」にした画像は送らない
    const items =
      pending.items.filter(
        (item) => !item.skip
      )

    if (items.length === 0) {
      setMessage({
        type: 'error',
        text: '保存する画像がありません。'
      })
      return
    }

    setMessage(null)

    try {
      await uploadQueue.enqueue({
        slug,
        year,
        folder,
        items: items.map((item) => {
          const spreadPosition =
            item.spreadId
              ? items.findIndex(
                  (other) =>
                    other.id === item.spreadId
                )
              : -1

          return {
            ...item.prepared,
            kind: item.kind,
            series: item.series,
            pageOf:
              spreadPosition >= 0
                ? spreadPosition
                : null
          }
        })
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

  // 【一時的な機能】登録済みの画像で、見開きと
  // それを1ページずつ撮った画像を自動で見つけてまとめる
  const handleGroupSpreads = async () => {
    setBusy('判定中')
    setMessage(null)

    let pages

    try {
      const items = []

      for (const image of images) {
        const blob =
          await getImageBlob(
            thumbKey(
              slug,
              year,
              folder,
              image.file
            )
          )

        items.push({
          id: image.file,
          width: image.width,
          height: image.height,
          signature:
            await signatureFromBlob(blob)
        })
      }

      pages = matchSpreadPages(items)
    } catch (error) {
      setBusy('')
      setMessage({
        type: 'error',
        text:
          error?.message ||
          '判定できませんでした。'
      })
      return
    }

    setBusy('')

    if (pages.size === 0) {
      setMessage({
        type: 'error',
        text: '見開きのページは見つかりませんでした（何も変えていません）。'
      })
      return
    }

    const ok = await change(
      '保存中',
      (current) =>
        setSpreadPagesInIssue(
          current,
          folder,
          pages
        )
    )

    if (ok) {
      setMessage({
        type: 'ok',
        text: `見開き ${
          new Set(pages.values()).size
        } 枚に、ページ ${pages.size} 枚をまとめました。「完了」を押すと一覧は見開きだけになります。`
      })
    }
  }

  const handleUngroupSpreads = () =>
    change('保存中', (current) =>
      setSpreadPagesInIssue(
        current,
        folder,
        new Map()
      )
    )

  const hasGroupedPages = images.some(
    (image) => image.pageOf
  )

  const dragHandlers = (image) => ({
    onPointerDown: (event) => {
      if (!canChange) {
        return
      }

      event.preventDefault()
      event.currentTarget.setPointerCapture?.(
        event.pointerId
      )

      dragRef.current = {
        file: image.file,
        over: image.file
      }
      setDrag(dragRef.current)
    },
    onPointerMove: (event) => {
      const current = dragRef.current

      if (!current) {
        return
      }

      // 画面の上下の端に近づいたら少しずつスクロール
      if (event.clientY < 90) {
        window.scrollBy(0, -14)
      } else if (
        event.clientY >
        window.innerHeight - 90
      ) {
        window.scrollBy(0, 14)
      }

      const over =
        document
          .elementFromPoint(
            event.clientX,
            event.clientY
          )
          ?.closest('[data-drag-file]')
          ?.getAttribute('data-drag-file')

      if (over && over !== current.over) {
        dragRef.current = {
          ...current,
          over
        }
        setDrag(dragRef.current)
      }
    },
    onPointerUp: () => {
      const current = dragRef.current

      dragRef.current = null
      setDrag(null)

      if (
        !current ||
        current.over === current.file
      ) {
        return
      }

      const to =
        images.findIndex(
          (item) => item.file === current.over
        )

      change('保存中', (index) =>
        moveImageToInIssue(
          index,
          folder,
          current.file,
          to
        )
      )
    },
    onPointerCancel: () => {
      dragRef.current = null
      setDrag(null)
    }
  })

  // 見開きの種類を変えたら、それを1ページずつ撮った画像も同じ種類にする
  const changeKind = (image, kind) =>
    change('保存中', (current) => {
      let next =
        setImageKindInIssue(
          current,
          folder,
          image.file,
          kind
        )

      for (const page of images) {
        if (page.pageOf === image.file) {
          next =
            setImageKindInIssue(
              next,
              folder,
              page.file,
              kind
            )
        }
      }

      return next
    })

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
                    series,
                    autoSeries: false
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
    <div
      className="app"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
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

      {isValid && canSwipe && (
        <div className="color-issue-nav">
          <button
            type="button"
            disabled={!nextIssue}
            onClick={() => goToIssue(nextIssue)}
          >
            ‹{' '}
            {nextIssue
              ? `${
                  nextIssue.year === year
                    ? ''
                    : `${nextIssue.year}年 `
                }${formatIssueFolder(
                  nextIssue.folder
                )}`
              : ''}
          </button>
          <span>左右にはらって号を移動</span>
          <button
            type="button"
            disabled={!prevIssue}
            onClick={() => goToIssue(prevIssue)}
          >
            {prevIssue
              ? `${
                  prevIssue.year === year
                    ? ''
                    : `${prevIssue.year}年 `
                }${formatIssueFolder(
                  prevIssue.folder
                )}`
              : ''}{' '}
            ›
          </button>
        </div>
      )}

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
          {isEditing && images.length > 1 && (
            <div className="color-temp-tool">
              <p className="color-temp-tool-title">
                🔧 一時的な機能：見開きのまとめ
              </p>
              <p className="color-temp-tool-text">
                前に登録した画像から、見開きと「それを1ページずつ撮った画像」を自動で探してまとめます。まとめると、一覧には見開きだけが出て、押すと3枚とも見られます。
              </p>
              <button
                type="button"
                className="color-temp-tool-button"
                disabled={!canChange}
                onClick={handleGroupSpreads}
              >
                {busy === '判定中'
                  ? '判定中…'
                  : 'この号の見開きを自動でまとめる'}
              </button>
              {hasGroupedPages && (
                <button
                  type="button"
                  className="color-temp-tool-undo"
                  disabled={!canChange}
                  onClick={handleUngroupSpreads}
                >
                  まとめを解除する
                </button>
              )}
            </div>
          )}

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

          {!state.fromCache && !pending && (
            <button
              type="button"
              className="cloud-settings-secondary"
              disabled={!canChange}
              onClick={() =>
                navigate(
                  `/color/${slug}/import?y=${year}&i=${folder}`
                )
              }
            >
              何号分もまとめて追加（この号から）
            </button>
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

                      {item.skip && (
                        <button
                          type="button"
                          className="cloud-settings-secondary"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            updatePendingItem(
                              item.id,
                              { skip: false }
                            )
                          }
                        >
                          目次なので保存しない（押すと保存する）
                        </button>
                      )}

                      <button
                        type="button"
                        className={
                          item.autoSeries
                            ? 'cloud-settings-secondary color-auto-tag'
                            : 'cloud-settings-secondary'
                        }
                        disabled={Boolean(busy)}
                        onClick={() => {
                          // 自動で付いたタグは、押すと消して選び直す
                          if (item.autoSeries) {
                            updatePendingItem(
                              item.id,
                              {
                                series: [],
                                autoSeries: false
                              }
                            )
                          }

                          setTagTarget({
                            type: 'pending',
                            id: item.id
                          })
                        }}
                      >
                        {item.series.length > 0
                          ? `${
                              item.autoSeries
                                ? '自動：'
                                : ''
                            }${item.series.join('、')}`
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
            {gridImages.map((image) => {
              const position =
                images.indexOf(image)

              return (
              <div
                key={image.file}
                data-drag-file={
                  isEditing ? image.file : undefined
                }
                className={[
                  'color-image-card',
                  isSpreadSize(image) ? 'spread' : '',
                  drag?.file === image.file
                    ? 'dragging'
                    : '',
                  drag &&
                  drag.over === image.file &&
                  drag.file !== image.file
                    ? 'drag-over'
                    : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
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

                {isEditing && (
                  <button
                    type="button"
                    className="color-drag-handle"
                    aria-label="押さえたまま動かして並べ替え"
                    disabled={!canChange}
                    {...dragHandlers(image)}
                  >
                    ⠿
                  </button>
                )}

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
                        changeKind(
                          image,
                          event.target.value
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
            )
            })}
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
