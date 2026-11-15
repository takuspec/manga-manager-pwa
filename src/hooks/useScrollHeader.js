import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react'

// 画面ごとのスクロール位置。戻ったときに元の位置へ戻すために使う。
const positions = new Map()

// 下へスクロールしたら見出しを隠し、少し上へ戻したら出す。
// 見出しを隠し始めるのは、ページの先頭から少し下がってから。
const SHOW_NEAR_TOP_PX = 80
const DIRECTION_THRESHOLD_PX = 6

// locationKey: 画面の履歴ごとの識別子（react-router の location.key）
// ready: 中身の表示が終わったか（終わってから位置を戻す）
export default function useScrollHeader(
  locationKey,
  ready
) {
  const [hidden, setHidden] = useState(false)
  const lastYRef = useRef(0)
  const restoredRef = useRef('')

  useLayoutEffect(() => {
    if (
      !ready ||
      restoredRef.current === locationKey
    ) {
      return
    }

    restoredRef.current = locationKey

    const saved = positions.get(locationKey) || 0

    window.scrollTo(0, saved)
    lastYRef.current = saved
  }, [locationKey, ready])

  useEffect(() => {
    let frame = 0

    const handleScroll = () => {
      if (frame) {
        return
      }

      frame = requestAnimationFrame(() => {
        frame = 0

        const y = Math.max(0, window.scrollY)
        const dy = y - lastYRef.current

        if (restoredRef.current === locationKey) {
          positions.set(locationKey, y)
        }

        if (y < SHOW_NEAR_TOP_PX) {
          setHidden(false)
          lastYRef.current = y
          return
        }

        if (dy > DIRECTION_THRESHOLD_PX) {
          setHidden(true)
          lastYRef.current = y
        } else if (dy < -DIRECTION_THRESHOLD_PX) {
          setHidden(false)
          lastYRef.current = y
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

  return hidden
}

// 開いたときにページの先頭から表示する（前の画面のスクロール位置を引き継がない）
export function useScrollTopOnOpen() {
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [])
}
