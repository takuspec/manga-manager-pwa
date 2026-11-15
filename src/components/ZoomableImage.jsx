import {
  useEffect,
  useState
} from 'react'
import { createPortal } from 'react-dom'
import ImageView from './ImageView'
import {
  getImageBlob
} from '../utils/imageDb'

function formatBytes(bytes) {
  if (!bytes) {
    return ''
  }

  if (bytes >= 1024 * 1024) {
    return `${(
      bytes /
      1024 /
      1024
    ).toFixed(1)} MB`
  }

  return `${Math.round(bytes / 1024)} KB`
}

function getViewport() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    ratio: window.devicePixelRatio || 1
  }
}

function FullscreenImageViewer({
  imageId,
  imageBlob,
  fallbackImage,
  title,
  onClose
}) {
  const [source, setSource] =
    useState({
      url: '',
      bytes: 0,
      loaded: false
    })

  const [naturalSize, setNaturalSize] =
    useState(null)

  const [viewport, setViewport] =
    useState(getViewport)

  const [showInfo, setShowInfo] =
    useState(true)

  useEffect(() => {
    let isActive = true
    let objectUrl = ''

    const load = async () => {
      let blob = imageBlob || null

      if (!blob && imageId) {
        try {
          blob =
            await getImageBlob(imageId)
        } catch (error) {
          console.error(error)
        }
      }

      if (!isActive) {
        return
      }

      if (blob) {
        objectUrl =
          URL.createObjectURL(blob)

        setSource({
          url: objectUrl,
          bytes: blob.size,
          loaded: true
        })
        return
      }

      setSource({
        url: fallbackImage || '',
        bytes: 0,
        loaded: true
      })
    }

    load()

    return () => {
      isActive = false

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [
    imageId,
    imageBlob,
    fallbackImage
  ])

  useEffect(() => {
    const handleResize = () => {
      setViewport(getViewport())
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

  // 画面いっぱい（縦横比は維持）に表示したときの倍率。
  // 1倍を超えると、元画像より引き伸ばして表示している。
  const fitScale =
    naturalSize
      ? Math.min(
          viewport.width /
            naturalSize.width,
          viewport.height /
            naturalSize.height
        )
      : 0

  const deviceScale =
    fitScale * viewport.ratio

  const sizeLabel =
    formatBytes(source.bytes)

  return createPortal(
    <div
      className="fullscreen-image-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={
        title
          ? `${title} の画像`
          : '画像の全画面表示'
      }
      onClick={(event) => {
        event.stopPropagation()
        setShowInfo((value) => !value)
      }}
    >
      {source.url && (
        <img
          className="fullscreen-image-viewer-image"
          src={source.url}
          alt={title || ''}
          onLoad={(event) => {
            setNaturalSize({
              width:
                event.currentTarget
                  .naturalWidth,
              height:
                event.currentTarget
                  .naturalHeight
            })
          }}
        />
      )}

      {source.loaded && !source.url && (
        <div className="fullscreen-image-viewer-empty">
          画像がありません
        </div>
      )}

      <button
        type="button"
        className="fullscreen-image-viewer-close"
        aria-label="閉じる"
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
      >
        ×
      </button>

      {showInfo && naturalSize && (
        <div className="fullscreen-image-viewer-info">
          <div>
            画像: {naturalSize.width} ×{' '}
            {naturalSize.height} px
            {sizeLabel
              ? `（${sizeLabel}）`
              : ''}
          </div>
          <div>
            画面: {viewport.width} ×{' '}
            {viewport.height}（実ピクセル{' '}
            {Math.round(
              viewport.width *
                viewport.ratio
            )}{' '}
            ×{' '}
            {Math.round(
              viewport.height *
                viewport.ratio
            )}
            ）
          </div>
          <div>
            表示倍率:{' '}
            {deviceScale.toFixed(2)}倍
            {deviceScale > 1
              ? '（引き伸ばして表示）'
              : '（等倍以下で表示）'}
          </div>
          <div className="fullscreen-image-viewer-hint">
            タップで情報の表示を切り替え
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}

// ImageView と同じ見た目のまま、タップで全画面表示を開く。
function ZoomableImage({
  imageId,
  imageBlob,
  fallbackImage,
  alt = '',
  title = ''
}) {
  const [isOpen, setIsOpen] =
    useState(false)

  const hasImage =
    Boolean(
      imageId ||
        imageBlob ||
        fallbackImage
    )

  return (
    <>
      <button
        type="button"
        className="zoomable-image"
        aria-label="画像を全画面で表示"
        disabled={!hasImage}
        onClick={(event) => {
          event.stopPropagation()
          setIsOpen(true)
        }}
      >
        <ImageView
          imageId={imageId}
          imageBlob={imageBlob}
          fallbackImage={fallbackImage}
          alt={alt}
        />
      </button>

      {isOpen && (
        <FullscreenImageViewer
          imageId={imageId}
          imageBlob={imageBlob}
          fallbackImage={fallbackImage}
          title={title}
          onClose={() => {
            setIsOpen(false)
          }}
        />
      )}
    </>
  )
}

export default ZoomableImage
