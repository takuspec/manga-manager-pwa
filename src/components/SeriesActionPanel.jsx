import {
  buildAuthorSearchParam,
  getSeriesAuthorNames
} from '../utils/authorUtils'

function SeriesActionPanel({
  item,
  navigate,
  toggleStatus,
  updateStatus,
  deleteSeries,
  className = '',
  onEdit,
  onClose
}) {
  const authorSearchParam =
    buildAuthorSearchParam(item)
  const authorNames =
    getSeriesAuthorNames(item)

  return (
    <div
      className={`series-popup-menu ${className}`}
      onClick={(e) =>
        e.stopPropagation()
      }
    >
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
  )
}

export default SeriesActionPanel
