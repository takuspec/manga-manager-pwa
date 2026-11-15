import {
  useEffect,
  useRef,
  useState
} from 'react'
import { getImageBlob } from '../utils/colorStore'

// クラウド上の画像を表示する。
// 画面に入ってから取得し、一度取得したものは端末内の保存分を使う。
// 表示する画像を切り替えるときは、親が key を変えて作り直す。
function CloudImage({
  imageKey,
  alt = '',
  eager = false
}) {
  const holderRef = useRef(null)

  const [visible, setVisible] =
    useState(
      () =>
        eager ||
        typeof IntersectionObserver ===
          'undefined'
    )

  const [state, setState] =
    useState({
      url: '',
      failed: false
    })

  useEffect(() => {
    if (visible || !holderRef.current) {
      return undefined
    }

    const observer =
      new IntersectionObserver(
        (entries) => {
          if (
            entries.some(
              (entry) => entry.isIntersecting
            )
          ) {
            setVisible(true)
            observer.disconnect()
          }
        },
        {
          rootMargin: '200px'
        }
      )

    observer.observe(holderRef.current)

    return () => {
      observer.disconnect()
    }
  }, [visible])

  useEffect(() => {
    if (!visible || !imageKey) {
      return undefined
    }

    let active = true
    let objectUrl = ''

    getImageBlob(imageKey)
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
  }, [imageKey, visible])

  if (state.url) {
    return (
      <img
        src={state.url}
        alt={alt}
        draggable={false}
      />
    )
  }

  return (
    <div
      ref={holderRef}
      className="cloud-image-placeholder"
    >
      {state.failed ? '読込失敗' : ''}
    </div>
  )
}

export default CloudImage
