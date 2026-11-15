import {
  useEffect,
  useRef,
  useState
} from 'react'
import { createPortal } from 'react-dom'

// 画質の見比べ用ページ。
// 選んだ画像を5通りの大きさに作り直して全画面で見比べる。
// ここで選んだ画像はどこにも保存しない（ページを離れると消える）。
const LONG_EDGE_STEPS = [800, 1200, 1600, 2048]
const JPEG_QUALITY = 0.85
const MIN_SCALE = 1
const MAX_SCALE = 10
const DOUBLE_TAP_SCALE = 3
const DOUBLE_TAP_MS = 300

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(
      bytes /
      1024 /
      1024
    ).toFixed(1)} MB`
  }

  return `${Math.round(bytes / 1024)} KB`
}

function clamp(value, min, max) {
  return Math.min(
    max,
    Math.max(min, value)
  )
}

async function loadBitmap(file) {
  if (
    typeof createImageBitmap === 'function'
  ) {
    try {
      const bitmap =
        await createImageBitmap(
          file,
          {
            imageOrientation: 'from-image'
          }
        )

      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close()
      }
    } catch {
      // 下の <img> 方式にフォールバック
    }
  }

  const url =
    URL.createObjectURL(file)

  try {
    const image =
      await new Promise(
        (resolve, reject) => {
          const element =
            new Image()

          element.onload = () =>
            resolve(element)
          element.onerror = reject
          element.src = url
        }
      )

    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () =>
        URL.revokeObjectURL(url)
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function renderVariant(
  source,
  longEdge
) {
  const scale =
    Math.min(
      1,
      longEdge /
        Math.max(
          source.width,
          source.height
        )
    )

  const width =
    Math.max(
      1,
      Math.round(source.width * scale)
    )

  const height =
    Math.max(
      1,
      Math.round(source.height * scale)
    )

  const canvas =
    document.createElement('canvas')

  canvas.width = width
  canvas.height = height

  const ctx =
    canvas.getContext('2d')

  if (!ctx) {
    throw new Error(
      'Canvas context is not available'
    )
  }

  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(
    source.image,
    0,
    0,
    width,
    height
  )

  return new Promise(
    (resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(
              new Error(
                'Failed to create image blob'
              )
            )
            return
          }

          resolve({
            width,
            height,
            bytes: blob.size,
            url: URL.createObjectURL(blob)
          })
        },
        'image/jpeg',
        JPEG_QUALITY
      )
    }
  )
}

async function createVariants(file) {
  const source =
    await loadBitmap(file)

  try {
    const originalLongEdge =
      Math.max(
        source.width,
        source.height
      )

    const steps = [
      ...LONG_EDGE_STEPS.filter(
        (step) => step < originalLongEdge
      ),
      originalLongEdge
    ]

    const variants = []

    for (const step of steps) {
      const variant =
        await renderVariant(source, step)

      variants.push({
        ...variant,
        label:
          step === originalLongEdge
            ? `元サイズ（長辺${step}px）`
            : `長辺${step}px`,
        shortLabel:
          step === originalLongEdge
            ? '元'
            : String(step)
      })
    }

    return variants
  } finally {
    source.release()
  }
}

function getViewport() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    ratio: window.devicePixelRatio || 1
  }
}

function CompareViewer({
  variants,
  initialIndex,
  onClose
}) {
  const [activeIndex, setActiveIndex] =
    useState(initialIndex)

  const [viewport, setViewport] =
    useState(getViewport)

  // 表示位置。scale は画面いっぱい表示を1とした倍率、
  // x・y は画面中央からのずれ（px）。
  const [view, setView] =
    useState({
      scale: 1,
      x: 0,
      y: 0
    })

  const viewRef = useRef(view)
  const pointersRef = useRef(new Map())
  const gestureRef = useRef(null)
  const lastTapRef =
    useRef({
      time: 0,
      x: 0,
      y: 0
    })

  const active = variants[activeIndex]

  // 縦横比はどのサイズでも同じなので、
  // サイズを切り替えても同じ位置・同じ大きさのまま見比べられる。
  const fitScale =
    Math.min(
      viewport.width / active.width,
      viewport.height / active.height
    )

  const baseWidth =
    active.width * fitScale

  const baseHeight =
    active.height * fitScale

  const clampView = (next) => {
    const scale =
      clamp(
        next.scale,
        MIN_SCALE,
        MAX_SCALE
      )

    const maxX =
      Math.max(
        0,
        (baseWidth * scale -
          viewport.width) /
          2
      )

    const maxY =
      Math.max(
        0,
        (baseHeight * scale -
          viewport.height) /
          2
      )

    return {
      scale,
      x: clamp(next.x, -maxX, maxX),
      y: clamp(next.y, -maxY, maxY)
    }
  }

  const applyView = (next) => {
    const clamped = clampView(next)

    viewRef.current = clamped
    setView(clamped)
  }

  useEffect(() => {
    const handleResize = () => {
      setViewport(getViewport())
      viewRef.current = {
        scale: 1,
        x: 0,
        y: 0
      }
      setView(viewRef.current)
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener(
      'resize',
      handleResize
    )
    window.addEventListener(
      'keydown',
      handleKeyDown
    )

    return () => {
      window.removeEventListener(
        'resize',
        handleResize
      )
      window.removeEventListener(
        'keydown',
        handleKeyDown
      )
    }
  }, [onClose])

  const startGesture = () => {
    const points =
      Array.from(
        pointersRef.current.values()
      )

    if (points.length >= 2) {
      const [a, b] = points

      gestureRef.current = {
        type: 'pinch',
        distance:
          Math.hypot(
            a.x - b.x,
            a.y - b.y
          ) || 1,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        view: viewRef.current
      }
      return
    }

    if (points.length === 1) {
      gestureRef.current = {
        type: 'pan',
        startX: points[0].x,
        startY: points[0].y,
        view: viewRef.current
      }
      return
    }

    gestureRef.current = null
  }

  const zoomAt = (
    pointX,
    pointY,
    nextScale
  ) => {
    const current = viewRef.current
    const ratio =
      nextScale / current.scale

    const fromCenterX =
      pointX - viewport.width / 2
    const fromCenterY =
      pointY - viewport.height / 2

    applyView({
      scale: nextScale,
      x:
        fromCenterX -
        (fromCenterX - current.x) * ratio,
      y:
        fromCenterY -
        (fromCenterY - current.y) * ratio
    })
  }

  const handlePointerDown = (event) => {
    event.currentTarget.setPointerCapture?.(
      event.pointerId
    )

    pointersRef.current.set(
      event.pointerId,
      {
        x: event.clientX,
        y: event.clientY
      }
    )

    if (pointersRef.current.size === 1) {
      const now = Date.now()
      const last = lastTapRef.current

      const isDoubleTap =
        now - last.time <
          DOUBLE_TAP_MS &&
        Math.hypot(
          event.clientX - last.x,
          event.clientY - last.y
        ) < 30

      lastTapRef.current = {
        time: isDoubleTap ? 0 : now,
        x: event.clientX,
        y: event.clientY
      }

      if (isDoubleTap) {
        if (viewRef.current.scale > 1.01) {
          applyView({
            scale: 1,
            x: 0,
            y: 0
          })
        } else {
          zoomAt(
            event.clientX,
            event.clientY,
            DOUBLE_TAP_SCALE
          )
        }
      }
    }

    startGesture()
  }

  const handlePointerMove = (event) => {
    if (
      !pointersRef.current.has(
        event.pointerId
      )
    ) {
      return
    }

    pointersRef.current.set(
      event.pointerId,
      {
        x: event.clientX,
        y: event.clientY
      }
    )

    const gesture = gestureRef.current

    if (!gesture) {
      return
    }

    const points =
      Array.from(
        pointersRef.current.values()
      )

    if (
      gesture.type === 'pinch' &&
      points.length >= 2
    ) {
      const [a, b] = points

      const distance =
        Math.hypot(
          a.x - b.x,
          a.y - b.y
        ) || 1

      const midX = (a.x + b.x) / 2
      const midY = (a.y + b.y) / 2

      const nextScale =
        clamp(
          gesture.view.scale *
            (distance / gesture.distance),
          MIN_SCALE,
          MAX_SCALE
        )

      const ratio =
        nextScale / gesture.view.scale

      const startFromCenterX =
        gesture.midX - viewport.width / 2
      const startFromCenterY =
        gesture.midY - viewport.height / 2

      applyView({
        scale: nextScale,
        x:
          midX -
          viewport.width / 2 -
          (startFromCenterX -
            gesture.view.x) *
            ratio,
        y:
          midY -
          viewport.height / 2 -
          (startFromCenterY -
            gesture.view.y) *
            ratio
      })
      return
    }

    if (
      gesture.type === 'pan' &&
      points.length === 1
    ) {
      applyView({
        scale: gesture.view.scale,
        x:
          gesture.view.x +
          (points[0].x - gesture.startX),
        y:
          gesture.view.y +
          (points[0].y - gesture.startY)
      })
    }
  }

  const handlePointerEnd = (event) => {
    pointersRef.current.delete(
      event.pointerId
    )
    startGesture()
  }

  const displayWidth =
    baseWidth * view.scale

  const displayHeight =
    baseHeight * view.scale

  // 画面の実ピクセル1つに対して、画像のピクセルが何個分あるか。
  // 1倍を超えると画像を引き伸ばして表示している。
  const deviceScale =
    (displayWidth * viewport.ratio) /
    active.width

  return createPortal(
    <div
      className="image-compare-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="画質の見比べ"
    >
      <div
        className="image-compare-stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <img
          className="image-compare-image"
          src={active.url}
          alt=""
          draggable={false}
          style={{
            width: `${displayWidth}px`,
            height: `${displayHeight}px`,
            left: `${
              (viewport.width -
                displayWidth) /
                2 +
              view.x
            }px`,
            top: `${
              (viewport.height -
                displayHeight) /
                2 +
              view.y
            }px`
          }}
        />
      </div>

      <div className="image-compare-info">
        <div>
          {active.label}・{active.width} ×{' '}
          {active.height}px・
          {formatBytes(active.bytes)}
        </div>
        <div>
          拡大 {view.scale.toFixed(1)}倍・
          表示倍率{' '}
          {deviceScale.toFixed(2)}倍
          {deviceScale > 1
            ? '（引き伸ばし）'
            : ''}
        </div>
      </div>

      <button
        type="button"
        className="image-compare-close"
        aria-label="閉じる"
        onClick={onClose}
      >
        ×
      </button>

      <div className="image-compare-sizes">
        {variants.map((variant, index) => (
          <button
            key={variant.label}
            type="button"
            className={
              index === activeIndex
                ? 'image-compare-size active'
                : 'image-compare-size'
            }
            aria-pressed={
              index === activeIndex
            }
            onClick={() =>
              setActiveIndex(index)
            }
          >
            {variant.shortLabel}
          </button>
        ))}
      </div>
    </div>,
    document.body
  )
}

function ImageSizeTestPage({
  navigate
}) {
  const [variants, setVariants] =
    useState([])

  const [status, setStatus] =
    useState('idle')

  const [viewerIndex, setViewerIndex] =
    useState(null)

  const urlsRef = useRef([])

  const releaseUrls = () => {
    urlsRef.current.forEach((url) => {
      URL.revokeObjectURL(url)
    })
    urlsRef.current = []
  }

  useEffect(() => {
    return () => {
      urlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url)
      })
      urlsRef.current = []
    }
  }, [])

  const handleFileChange = async (
    event
  ) => {
    const file =
      event.target.files?.[0]

    event.target.value = ''

    if (!file) {
      return
    }

    setStatus('loading')
    setViewerIndex(null)

    try {
      const nextVariants =
        await createVariants(file)

      releaseUrls()
      urlsRef.current =
        nextVariants.map(
          (variant) => variant.url
        )

      setVariants(nextVariants)
      setStatus('ready')
    } catch (error) {
      console.error(error)
      setStatus('error')
    }
  }

  return (
    <div className="app">
      <div className="series-page-header">
        <button
          className="back-button"
          onClick={() => navigate('/')}
        >
          ← 戻る
        </button>

        <div className="title series-page-title">
          画質の見比べ
        </div>

        <div />
      </div>

      <div className="image-size-test">
        <p className="image-size-test-note">
          画像を1枚選ぶと、5通りの大きさに作り直して全画面で見比べられます。選んだ画像は保存されません。
        </p>

        <label className="image-size-test-pick">
          画像を選ぶ
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
          />
        </label>

        {status === 'loading' && (
          <div className="empty-message">
            作成中…
          </div>
        )}

        {status === 'error' && (
          <div className="empty-message">
            画像を読み込めませんでした。別の画像で試してください。
          </div>
        )}

        {status === 'ready' && (
          <div className="image-size-test-list">
            {variants.map(
              (variant, index) => (
                <button
                  key={variant.label}
                  type="button"
                  className="weekly-settings-card"
                  onClick={() =>
                    setViewerIndex(index)
                  }
                >
                  <span>
                    {variant.label}
                    <small className="image-size-test-meta">
                      {variant.width} ×{' '}
                      {variant.height}px・
                      {formatBytes(
                        variant.bytes
                      )}
                    </small>
                  </span>
                  <strong>›</strong>
                </button>
              )
            )}

            <p className="image-size-test-note">
              全画面では、下のボタンで大きさを切り替えられます。2本指で拡大、ダブルタップで3倍と元の大きさを切り替えます。
            </p>
          </div>
        )}
      </div>

      {viewerIndex !== null &&
        variants[viewerIndex] && (
          <CompareViewer
            variants={variants}
            initialIndex={viewerIndex}
            onClose={() =>
              setViewerIndex(null)
            }
          />
        )}
    </div>
  )
}

export default ImageSizeTestPage
