import { useRef, useState } from 'react'
import {
  buildTimeline,
  listTimelineYears
} from '../utils/colorTimeline'
import { getEstimatedLatestIssueInfo } from '../utils/issueUtils'

// 作品ごとのカラー年表。1年分の号をマス目で並べ、左右にはらって年を移る。
// マスを押すと、その号のこの作品の画像を全画面で見る（画像がなければ号の画面へ）
function ColorSeriesTimeline({
  appMagazine,
  seriesList,
  series,
  title,
  images,
  initialYear,
  onYearChange,
  onOpenImages,
  onOpenIssue
}) {
  const latestYear =
    appMagazine
      ? getEstimatedLatestIssueInfo(appMagazine)?.year
      : null

  const years =
    listTimelineYears(series, images, latestYear)

  const fallbackYear =
    images.length > 0
      ? Math.max(
          ...images.map((image) => Number(image.year))
        )
      : years[years.length - 1]

  const [selectedYear, setSelectedYear] =
    useState(
      years.includes(initialYear)
        ? initialYear
        : fallbackYear
    )

  const year =
    years.includes(selectedYear)
      ? selectedYear
      : fallbackYear

  const position = years.indexOf(year)
  const newerYear = years[position + 1]
  const olderYear = years[position - 1]

  const swipeRef = useRef(null)

  const goToYear = (next) => {
    if (!next) {
      return
    }

    setSelectedYear(next)
    onYearChange?.(next)
  }

  if (!year) {
    return (
      <div className="empty-message">
        年表を作れる情報がありません。
      </div>
    )
  }

  const { cells, summary } =
    buildTimeline({
      appMagazine,
      seriesList,
      series,
      title,
      year,
      images
    })

  return (
    <div
      className="color-timeline"
      onTouchStart={(event) => {
        swipeRef.current =
          event.touches.length === 1
            ? {
                x: event.touches[0].clientX,
                y: event.touches[0].clientY,
                time: event.timeStamp
              }
            : null
      }}
      onTouchEnd={(event) => {
        const start = swipeRef.current

        swipeRef.current = null

        if (!start) {
          return
        }

        const touch = event.changedTouches[0]
        const dx = touch.clientX - start.x
        const dy = touch.clientY - start.y

        // 右へはらうと新しい年、左へはらうと古い年（号の画面と同じ向き）
        if (
          Math.abs(dx) > 70 &&
          Math.abs(dx) > Math.abs(dy) * 2 &&
          event.timeStamp - start.time < 700
        ) {
          goToYear(dx > 0 ? newerYear : olderYear)
        }
      }}
    >
      <div className="color-timeline-years">
        <button
          type="button"
          disabled={!newerYear}
          aria-label={
            newerYear ? `${newerYear}年へ` : '新しい年はありません'
          }
          onClick={() => goToYear(newerYear)}
        >
          ‹ {newerYear || ''}
        </button>
        <strong>{year}年</strong>
        <button
          type="button"
          disabled={!olderYear}
          aria-label={
            olderYear ? `${olderYear}年へ` : '古い年はありません'
          }
          onClick={() => goToYear(olderYear)}
        >
          {olderYear || ''} ›
        </button>
      </div>

      <div className="color-timeline-summary">
        <div className="kind-cover">
          <span>表紙</span>
          <strong>{summary.cover}</strong>
        </div>
        <div className="kind-opening">
          <span>巻頭</span>
          <strong>{summary.opening}</strong>
        </div>
        <div className="kind-center">
          <span>センター</span>
          <strong>{summary.center}</strong>
        </div>
        <div className="kind-other">
          <strong>{summary.colorIssues}</strong>
          <span>/{summary.published}号</span>
        </div>
      </div>

      <div className="color-timeline-grid">
        {cells.map((cell) => (
          <button
            key={cell.folder}
            type="button"
            className={[
              'color-timeline-cell',
              cell.outside ? 'outside' : '',
              cell.start ? 'start' : '',
              cell.cover
                ? 'has-cover'
                : cell.opening
                  ? 'has-opening'
                  : cell.center
                    ? 'has-center'
                    : ''
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={`${year}年 ${cell.label}号${
              cell.images.length > 0
                ? `（画像 ${cell.images.length} 枚）`
                : ''
            }`}
            onClick={() =>
              cell.images.length > 0
                ? onOpenImages(cell.images)
                : onOpenIssue(year, cell.folder)
            }
          >
            <span className="color-timeline-number">
              {cell.label}
            </span>
            <span className="color-timeline-marks">
              {cell.cover && (
                <span className="mark kind-cover">表</span>
              )}
              {cell.opening && (
                <span className="mark kind-opening">巻</span>
              )}
              {cell.center && (
                <span className="mark kind-center">セ</span>
              )}
              {cell.other &&
                !cell.cover &&
                !cell.opening &&
                !cell.center && (
                  <span className="mark kind-other">他</span>
                )}
              {cell.start && (
                <span className="flag start">▶開始</span>
              )}
              {cell.end && (
                <span className="flag end">■完結</span>
              )}
            </span>
          </button>
        ))}
      </div>

      <p className="color-timeline-legend">
        <span>表＝表紙</span>
        <span>巻＝巻頭カラー</span>
        <span>セ＝センターカラー</span>
        <span>点線＝連載していない号</span>
      </p>
    </div>
  )
}

export default ColorSeriesTimeline
