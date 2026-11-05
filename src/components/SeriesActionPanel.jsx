import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  buildAuthorSearchParam,
  getSeriesAuthorNames
} from '../utils/authorUtils'

function SeriesActionPanel({
  item,
  navigate,
  toggleStatus,
  toggleMagazineUnreadExclusion,
  updateStatus,
  deleteSeries,
  className = '',
  onEdit,
  onClose
}) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const authorSearchParam =
    buildAuthorSearchParam(item)
  const authorNames =
    getSeriesAuthorNames(item)

  return createPortal(
    <dialog ref={dialogRef} className="series-action-dialog"
      aria-label={`${item.title}の作品メニュー`}
      onCancel={() => onClose?.()}
      onClick={(event) => {
        event.stopPropagation()
        if (event.target === event.currentTarget) onClose?.()
      }}>
      <div
        className={`series-popup-menu ${className}`}
        onClick={(e) =>
          e.stopPropagation()
        }
      >
        <div className="series-action-heading">
          <strong>{item.title}</strong>
          <button type="button" className="sheet-close" aria-label="作品メニューを閉じる"
            onClick={() => onClose?.()}>×</button>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (onEdit) {
              onEdit(item)
            } else {
              navigate(
                `/series/${item.id}`
              )
            }
            onClose?.()
          }}
        >
          編集
        </button>

        {authorSearchParam && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (authorNames.length > 1) {
                navigate(
                  `/authors/select/${item.id}`
                )
              } else {
                navigate(
                  `/authors?q=${encodeURIComponent(
                    authorSearchParam
                  )}`
                )
              }
              onClose?.()
            }}
          >
            同作者の作品
          </button>
        )}

        {toggleMagazineUnreadExclusion && (
          <button
            type="button"
            aria-pressed={!!item.excludeFromMagazineUnread}
            onClick={() => {
              toggleMagazineUnreadExclusion(item.id)
              onClose?.()
            }}
          >
            {item.excludeFromMagazineUnread
              ? '雑誌の未読数に含める'
              : '雑誌の未読数から除外する'}
          </button>
        )}

        {item.status !== 'completed' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()

              const nextStatus =
                item.status === 'paused'
                  ? 'ongoing'
                  : 'paused'

              const ok =
                window.confirm(
                  nextStatus === 'paused'
                    ? `「${item.title}」を休載中にしますか？`
                    : `「${item.title}」を連載中に戻しますか？`
                )

              if (!ok) {
                return
              }

              updateStatus?.(
                item.id,
                nextStatus
              )
              onClose?.()
            }}
          >
            {item.status === 'paused'
              ? '連載中に戻す'
              : '休載中にする'}
          </button>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()

            const ok =
              window.confirm(
                item.status === 'completed'
                  ? `「${item.title}」を連載中に戻しますか？`
                  : `「${item.title}」を完結にしますか？`
              )

            if (!ok) {
              return
            }

            toggleStatus(item.id)
            onClose?.()
          }}
        >
          {item.status === 'completed'
            ? '連載中に戻す'
            : '完結にする'}
        </button>

        <button
          type="button"
          className="action-delete"
          onClick={(e) => {
            e.stopPropagation()

            const ok =
              window.confirm(
                `「${item.title}」を削除しますか？`
              )

            if (!ok) {
              return
            }

            deleteSeries(item.id)
            onClose?.()
          }}
        >
          削除
        </button>
      </div>
    </dialog>,
    document.body
  )
}

export default SeriesActionPanel
