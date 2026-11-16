import {
  useEffect,
  useLayoutEffect,
  useRef
} from 'react'
import {
  useLocation,
  useNavigate
} from 'react-router-dom'

// 画面ごとのスクロール位置。戻ったときに元の位置へ戻すために使う。
const positions = new Map()

// locationKey: 画面の履歴ごとの識別子（react-router の location.key）
// ready: 中身の表示が終わったか（終わってから位置を戻す）
export default function useScrollRestore(
  locationKey,
  ready
) {
  const restoredRef = useRef('')

  useLayoutEffect(() => {
    if (
      !ready ||
      restoredRef.current === locationKey
    ) {
      return
    }

    restoredRef.current = locationKey
    window.scrollTo(
      0,
      positions.get(locationKey) || 0
    )
  }, [locationKey, ready])

  useEffect(() => {
    let frame = 0

    const handleScroll = () => {
      if (frame) {
        return
      }

      frame = requestAnimationFrame(() => {
        frame = 0

        if (restoredRef.current === locationKey) {
          positions.set(
            locationKey,
            Math.max(0, window.scrollY)
          )
        }
      })
    }

    window.addEventListener('scroll', handleScroll, {
      passive: true
    })

    return () => {
      window.removeEventListener(
        'scroll',
        handleScroll
      )
      cancelAnimationFrame(frame)
    }
  }, [locationKey])
}

// 開いたときにページの先頭から表示する（前の画面のスクロール位置を引き継がない）
export function useScrollTopOnOpen() {
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [])
}

// 「戻る」ボタン用。アプリの中から来たときは、来た画面へそのまま戻る
// （どの画面から開いても、元の画面とスクロール位置に戻れるように）。
// 直接開いたときなど、戻る先がなければ fallback へ移る。
export function useGoBack(fallback) {
  const navigate = useNavigate()
  const location = useLocation()

  return () => {
    if (location.key !== 'default') {
      navigate(-1)
      return
    }

    navigate(fallback, {
      replace: true
    })
  }
}
