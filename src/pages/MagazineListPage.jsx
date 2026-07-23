import { useEffect, useRef, useState } from 'react'
import {
  getEstimatedLatestIssueInfo
} from '../utils/issueUtils'
import DataActionMenu from '../components/DataActionMenu'
import ImageView from '../components/ImageView'
import IssueLabel from '../components/IssueLabel'

function MagazineListPage({
  magazineList,
  seriesList,
  newMagazineName,
  setNewMagazineName,
  addMagazine,
  getUnreadCount,
  getMagazineCover,
  onBackupData,
  onImportData,
  moveMagazine,
  navigate
}) {
  const [
    draggingMagazineId,
    setDraggingMagazineId
  ] = useState(null)

  const longPressTimerRef = useRef(null)
  const draggingMagazineIdRef = useRef(null)
  const draggingIndexRef = useRef(null)
  const pointerStartYRef = useRef(0)
  const hasDraggedRef = useRef(false)
  const touchScrollLockedRef = useRef(false)
  const touchMoveBlockerRef = useRef(
    (event) => {
      if (draggingMagazineIdRef.current) {
        event.preventDefault()
      }
    }
  )

  const clearLongPressTimer = () => {
    if (!longPressTimerRef.current) {
      return
    }

    window.clearTimeout(
      longPressTimerRef.current
    )
    longPressTimerRef.current = null
  }

  const lockTouchScroll = () => {
    if (touchScrollLockedRef.current) {
      return
    }

    document.addEventListener(
      'touchmove',
      touchMoveBlockerRef.current,
      { passive: false }
    )
    touchScrollLockedRef.current = true
  }

  const unlockTouchScroll = () => {
    if (!touchScrollLockedRef.current) {
      return
    }

    document.removeEventListener(
      'touchmove',
      touchMoveBlockerRef.current
    )
    touchScrollLockedRef.current = false
  }

  useEffect(() => {
    return () => {
      clearLongPressTimer()
      unlockTouchScroll()
    }
  }, [])

  const isInteractiveTarget = (target) => {
    return Boolean(
      target?.closest?.(
        'button, input, select, textarea, a'
      )
    )
  }

  const handleMagazinePointerDown = (
    event,
    magazineId,
    index
  ) => {
    if (
      !moveMagazine ||
      isInteractiveTarget(event.target)
    ) {
      return
    }

    clearLongPressTimer()

    const card = event.currentTarget
    const pointerId = event.pointerId

    pointerStartYRef.current =
      event.clientY
    hasDraggedRef.current = false

    longPressTimerRef.current =
      window.setTimeout(() => {
        draggingMagazineIdRef.current =
          magazineId
        draggingIndexRef.current = index
        hasDraggedRef.current = true
        setDraggingMagazineId(magazineId)
        lockTouchScroll()

        try {
          card.setPointerCapture?.(
            pointerId
          )
        } catch {
          // Pointer capture can fail if the browser already ended the touch.
        }
      }, 450)
  }

  const handleMagazinePointerMove = (
    event
  ) => {
    if (!draggingMagazineIdRef.current) {
      const movedY =
        Math.abs(
          event.clientY -
            pointerStartYRef.current
        )

      if (movedY > 10) {
        clearLongPressTimer()
      }

      return
    }

    event.preventDefault()

    const target =
      document.elementFromPoint(
        event.clientX,
        event.clientY
      )

    const targetCard =
      target?.closest?.(
        '[data-magazine-index]'
      )

    if (!targetCard) {
      return
    }

    const targetIndex =
      Number(
        targetCard.dataset.magazineIndex
      )

    const currentIndex =
      draggingIndexRef.current

    if (
      Number.isNaN(targetIndex) ||
      targetIndex === currentIndex
    ) {
      return
    }

    moveMagazine(
      currentIndex,
      targetIndex
    )

    draggingIndexRef.current =
      targetIndex
  }

  const finishMagazineDrag = (event) => {
    clearLongPressTimer()

    if (!draggingMagazineIdRef.current) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    try {
      event.currentTarget.releasePointerCapture?.(
        event.pointerId
      )
    } catch {
      // Ignore release failures when capture was already cleared.
    }

    draggingMagazineIdRef.current = null
    draggingIndexRef.current = null
    setDraggingMagazineId(null)
    unlockTouchScroll()

    window.setTimeout(() => {
      hasDraggedRef.current = false
    }, 0)
  }

  return (
    <div className="app">

      <div className="page-title-row">
      <div className="title">
        雑誌一覧
      </div>

      <DataActionMenu
        onBackupData={onBackupData}
        onImportData={onImportData}
        onWeeklySettings={() =>
          navigate('/weekly-settings')
        }
      />
      </div>

      <div className="magazine-add-row">

        <input
          type="text"
          placeholder="新規雑誌を入力"
          value={newMagazineName}
          onChange={(e) =>
            setNewMagazineName(
              e.target.value
            )
          }
        />

        <button onClick={addMagazine}>
          雑誌追加
        </button>

      </div>

      <div className="magazine-list">

        {magazineList.map((magazine, index) => {
          const magazineSeries =
            seriesList.filter((item) => {
              return (
                item.magazineId ===
                  magazine.id &&
                (item.status === 'ongoing' ||
                  item.status === 'paused')
              )
            })

          const seriesCount =
            magazineSeries.length

          const unreadTotal =
            magazineSeries.reduce(
              (total, item) => {
                return (
                  total +
                  getUnreadCount(item)
                )
              },
              0
            )

          const coverImage =
            getMagazineCover(magazine)

          const latestIssue =
            getEstimatedLatestIssueInfo(
              magazine
            )

          return (
            <div
              key={magazine.id}
              data-magazine-index={index}
              className={`magazine-list-card ${
                draggingMagazineId === magazine.id
                  ? 'dragging'
                  : ''
              }`}
              onPointerDown={(event) =>
                handleMagazinePointerDown(
                  event,
                  magazine.id,
                  index
                )
              }
              onPointerMove={
                handleMagazinePointerMove
              }
              onPointerUp={
                finishMagazineDrag
              }
              onPointerCancel={
                finishMagazineDrag
              }
              onContextMenu={(event) => {
                if (
                  draggingMagazineId ===
                    magazine.id ||
                  longPressTimerRef.current
                ) {
                  event.preventDefault()
                }
              }}
              onClick={(event) => {
                if (
                  hasDraggedRef.current ||
                  draggingMagazineIdRef.current
                ) {
                  event.preventDefault()
                  event.stopPropagation()
                  return
                }

                navigate(
                  `/magazine/${magazine.id}`
                )
              }}
            >

              <div className="magazine-cover">

                <ImageView
                  imageId={coverImage.imageId}
                  fallbackImage={coverImage.image}
                />

              </div>

              <div className="magazine-info">

                <div className="magazine-title">
                  {magazine.name}
                </div>

                <div className="magazine-stat">
                  最新号
                  <span>
                    <IssueLabel
                      magazine={magazine}
                      year={latestIssue.year}
                      issue={latestIssue.issue}
                    />
                  </span>
                </div>

                <div className="magazine-stat">
                  連載
                  <span>
                    {seriesCount}作品
                  </span>
                </div>

                <div className="magazine-stat">
                  未読
                  <span>
                    {unreadTotal}
                  </span>
                </div>

              </div>

              <button
                className="magazine-menu-button"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  clearLongPressTimer()
                }}
                onClick={(e) => {
                  e.stopPropagation()

                  navigate(
                    `/magazine/${magazine.id}/edit`
                  )
                }}
              >
                ⋮
              </button>

            </div>
          )
        })}

      </div>

      <div className="bottom-nav">

        <button>
          雑誌
        </button>

        <button
          onClick={() =>
            navigate('/completed')
          }
        >
          完結
        </button>

        <button
          onClick={() =>
            navigate('/timeline')
          }
        >
          年表
        </button>

      </div>

    </div>
  )
}

export default MagazineListPage
