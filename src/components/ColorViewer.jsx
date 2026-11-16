import {
  useEffect,
  useRef,
  useState
} from 'react'
import { createPortal } from 'react-dom'
import { getImageBlob } from '../utils/colorStore'
import {
  formatIssueFolder,
  getKindLabel,
  normalizeKind,
  imageKey,
  thumbKey
} from '../utils/colorLibrary'

const MIN_SCALE = 1
const MAX_SCALE = 10
const DOUBLE_TAP_SCALE = 3
const DOUBLE_TAP_MS = 300
const SWIPE_DISTANCE = 50

function clamp(value, min, max) {
  return Math.min(
    max,
    Math.max(min, value)
  )
}

function getViewport() {
  return {
    width: window.innerWidth,
    height: window.innerHeight
  }
}

function useObjectUrl(key, attempt) {
  const [state, setState] =
    useState({
      url: '',
      failed: false
    })

  useEffect(() => {
    let active = true
    let objectUrl = ''

    getImageBlob(key)
      .then((blob) => {
        if (!active) {
          return
        }

        objectUrl =
          URL.createObjectURL(blob)

        setState({
          url: objectUrl,
          failed: false
        })
      })
      .catch((error) => {
        console.error(error)

        if (active) {
          setState({
            url: '',
            failed: true
          })
        }
      })

    return () => {
      active = false

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [key, attempt])

  return state
}

// 1枚分の表示。拡大・移動・左右スワイプを受け持つ。
// 画像が切り替わるたびに作り直されるので、拡大の状態は自動で元に戻る。
function ViewerStage({
  slug,
  year,
  folder,
  image,
  viewport,
  onSwipe,
  onTap
}) {
  const [attempt, setAttempt] =
    useState(0)

  const thumb =
    useObjectUrl(
      thumbKey(
        slug,
        year,
        folder,
        image.file
      ),
      0
    )

  const full =
    useObjectUrl(
      imageKey(
        slug,
        year,
        folder,
        image.file
      ),
      attempt
    )

  // scale は画面いっぱい表示を1とした倍率、
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
  // 1回タップ（表示の切り替え）。ダブルタップと区別するため少し待つ
  const tapRef = useRef(null)
  const tapTimerRef = useRef(0)

  useEffect(() => {
    return () => clearTimeout(tapTimerRef.current)
  }, [])

  const lastTapRef =
    useRef({
      time: 0,
      x: 0,
      y: 0
    })

  // 大きさが記録されていない古いデータは、仮に縦長として扱う
  const contentWidth = image.width || 3
  const contentHeight = image.height || 4

  const fitScale =
    Math.min(
      viewport.width / contentWidth,
      viewport.height / contentHeight
    )

  const baseWidth =
    contentWidth * fitScale

  const baseHeight =
    contentHeight * fitScale

  const applyView = (next) => {
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

    const clamped = {
      scale,
      x: clamp(next.x, -maxX, maxX),
      y: clamp(next.y, -maxY, maxY)
    }

    viewRef.current = clamped
    setView(clamped)
  }

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
        lastX: points[0].x,
        lastY: points[0].y,
        view: viewRef.current
      }
      return
    }

    gestureRef.current = null
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

    clearTimeout(tapTimerRef.current)

    if (pointersRef.current.size === 1) {
      const now = Date.now()
      const last = lastTapRef.current

      const isDoubleTap =
        now - last.time < DOUBLE_TAP_MS &&
        Math.hypot(
          event.clientX - last.x,
          event.clientY - last.y
        ) < 30

      lastTapRef.current = {
        time: isDoubleTap ? 0 : now,
        x: event.clientX,
        y: event.clientY
      }

      tapRef.current = isDoubleTap
        ? null
        : {
            time: now,
            x: event.clientX,
            y: event.clientY
          }

      if (isDoubleTap) {
        const current = viewRef.current

        if (current.scale > 1.01) {
          applyView({
            scale: 1,
            x: 0,
            y: 0
          })
        } else {
          const ratio =
            DOUBLE_TAP_SCALE /
            current.scale

          const fromCenterX =
            event.clientX -
            viewport.width / 2

          const fromCenterY =
            event.clientY -
            viewport.height / 2

          applyView({
            scale: DOUBLE_TAP_SCALE,
            x:
              fromCenterX -
              (fromCenterX - current.x) *
                ratio,
            y:
              fromCenterY -
              (fromCenterY - current.y) *
                ratio
          })
        }
      }
    } else {
      tapRef.current = null
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

      const nextScale =
        clamp(
          gesture.view.scale *
            (distance / gesture.distance),
          MIN_SCALE,
          MAX_SCALE
        )

      const ratio =
        nextScale / gesture.view.scale

      applyView({
        scale: nextScale,
        x:
          (a.x + b.x) / 2 -
          viewport.width / 2 -
          (gesture.midX -
            viewport.width / 2 -
            gesture.view.x) *
            ratio,
        y:
          (a.y + b.y) / 2 -
          viewport.height / 2 -
          (gesture.midY -
            viewport.height / 2 -
            gesture.view.y) *
            ratio
      })
      return
    }

    if (
      gesture.type === 'pan' &&
      points.length === 1
    ) {
      gesture.lastX = points[0].x
      gesture.lastY = points[0].y

      if (gesture.view.scale > 1.01) {
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
  }

  const handlePointerEnd = (event) => {
    const gesture = gestureRef.current

    pointersRef.current.delete(
      event.pointerId
    )

    const tap = tapRef.current

    if (
      event.type === 'pointerup' &&
      tap &&
      pointersRef.current.size === 0 &&
      Date.now() - tap.time < DOUBLE_TAP_MS &&
      Math.hypot(
        event.clientX - tap.x,
        event.clientY - tap.y
      ) < 10
    ) {
      tapRef.current = null
      tapTimerRef.current = setTimeout(
        () => onTap?.(),
        DOUBLE_TAP_MS
      )
    } else if (pointersRef.current.size === 0) {
      tapRef.current = null
    }

    // 拡大していないときの横スワイプは、前後の画像へ移動
    if (
      event.type === 'pointerup' &&
      gesture?.type === 'pan' &&
      gesture.view.scale <= 1.01 &&
      pointersRef.current.size === 0
    ) {
      const dx =
        gesture.lastX - gesture.startX

      const dy =
        gesture.lastY - gesture.startY

      if (
        Math.abs(dx) > SWIPE_DISTANCE &&
        Math.abs(dx) > Math.abs(dy) * 1.5
      ) {
        gestureRef.current = null
        onSwipe(dx < 0 ? 1 : -1)
        return
      }
    }

    startGesture()
  }

  const displayWidth =
    baseWidth * view.scale

  const displayHeight =
    baseHeight * view.scale

  const src = full.url || thumb.url

  return (
    <div
      className="color-viewer-stage"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {src && (
        <img
          className="color-viewer-image"
          src={src}
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
      )}

      {!full.url && !full.failed && (
        <div className="color-viewer-status">
          読み込み中…
        </div>
      )}

      {full.failed && (
        <div className="color-viewer-status">
          <span>
            元の画像を読み込めませんでした。
          </span>
          <button
            type="button"
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
            onClick={() =>
              setAttempt((value) => value + 1)
            }
          >
            もう一度
          </button>
        </div>
      )}
    </div>
  )
}

// images の各要素が year・folder を持っていればそれを使う
// （作品ごとの表示では、号をまたいだ画像が並ぶ）。
function ColorViewer({
  slug,
  year,
  folder,
  images,
  initialIndex,
  onClose
}) {
  const [position, setPosition] =
    useState(initialIndex)

  // 画像をタップすると情報表示を消す／出す。移動しても状態はそのまま
  const [infoVisible, setInfoVisible] =
    useState(true)

  const [viewport, setViewport] =
    useState(getViewport)

  const index =
    clamp(position, 0, images.length - 1)

  const image = images[index]

  const move = (delta) => {
    setPosition((current) => {
      return clamp(
        current + delta,
        0,
        images.length - 1
      )
    })
  }

  useEffect(() => {
    const handleResize = () => {
      setViewport(getViewport())
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      } else if (
        event.key === 'ArrowRight'
      ) {
        setPosition((current) =>
          Math.min(
            current + 1,
            images.length - 1
          )
        )
      } else if (
        event.key === 'ArrowLeft'
      ) {
        setPosition((current) =>
          Math.max(current - 1, 0)
        )
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
  }, [onClose, images.length])

  if (!image) {
    return null
  }

  const imageYear = image.year ?? year
  const imageFolder = image.folder ?? folder

  return createPortal(
    <div
      className="color-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="カラーページの全画面表示"
    >
      <ViewerStage
        key={`${imageYear}/${imageFolder}/${image.file}:${viewport.width}x${viewport.height}`}
        slug={slug}
        year={imageYear}
        folder={imageFolder}
        image={image}
        viewport={viewport}
        onSwipe={move}
        onTap={() =>
          setInfoVisible((current) => !current)
        }
      />

      {/* 年と号・種類・何枚目か */}
      {infoVisible && (
        <div className="color-viewer-info">
          {imageYear}年{' '}
          {formatIssueFolder(imageFolder)}・
          {getKindLabel(normalizeKind(image.kind))}・
          {index + 1} / {images.length}
        </div>
      )}

      <button
        type="button"
        className="color-viewer-close"
        aria-label="閉じる"
        onClick={onClose}
      >
        ×
      </button>

      {infoVisible && index > 0 && (
        <button
          type="button"
          className="color-viewer-nav prev"
          aria-label="前の画像"
          onClick={() => move(-1)}
        >
          ‹
        </button>
      )}

      {infoVisible && index < images.length - 1 && (
        <button
          type="button"
          className="color-viewer-nav next"
          aria-label="次の画像"
          onClick={() => move(1)}
        >
          ›
        </button>
      )}
    </div>,
    document.body
  )
}

export default ColorViewer
