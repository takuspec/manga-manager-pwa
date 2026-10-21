import {
  useRef,
} from 'react'
import { useParams } from 'react-router-dom'
import {
  getWeeklyFinalIssue,
  getWeeklyMergedIssues,
  getYearOptions
} from '../utils/issueUtils'

function WeeklyIssueRulesPage({
  magazineList,
  updateWeeklyIssueRule,
  navigate
}) {
  const params = useParams()
  const currentYear =
    new Date().getFullYear()
  const years =
    getYearOptions()

  const currentYearRef =
    useRef(null)

  const magazineId =
    Number(params.magazineId)

  const magazine =
    magazineList.find((item) => {
      return item.id === magazineId
    })

  if (
    !magazine ||
    magazine.frequency !== 'weekly'
  ) {
    return (
      <div className="app">
        <button
          className="back-button"
          onClick={() =>
            navigate('/weekly-settings')
          }
        >
          ← 戻る
        </button>

        <div className="title">
          週刊誌が見つかりません
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="series-page-header">
        <button
          className="back-button"
          onClick={() =>
            navigate('/weekly-settings')
          }
        >
          ← 戻る
        </button>

        <div className="title series-page-title">
          {magazine.name}
        </div>

        <button
          className="mode-button"
          onClick={() =>
            currentYearRef.current?.scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            })
          }
        >
          今年へ
        </button>
      </div>

      <div className="weekly-year-list">
        {years.map((year) => {
          const selected =
            getWeeklyFinalIssue(
              magazine,
              year
            )

          const mergedIssues =
            getWeeklyMergedIssues(
              magazine,
              year
            )

          return (
            <div
              key={year}
              ref={
                year === currentYear
                  ? currentYearRef
                  : null
              }
              className={`weekly-year-row ${
                year === currentYear
                  ? 'current'
                  : ''
              }`}
              role="button"
              tabIndex={0}
              onClick={() =>
                navigate(
                  `/weekly-settings/${magazineId}/${year}`
                )
              }
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' ||
                  e.key === ' '
                ) {
                  e.preventDefault()
                  navigate(
                    `/weekly-settings/${magazineId}/${year}`
                  )
                }
              }}
            >
              <div className="weekly-year-label">
                {year}年
                <span className="weekly-merged-count">
                  合併 {mergedIssues.length}
                </span>
              </div>

              <div className="weekly-issue-toggle">
                <button
                  type="button"
                  className={
                    selected === 52
                      ? 'active'
                      : ''
                  }
                  onClick={(e) => {
                    e.stopPropagation()
                    updateWeeklyIssueRule(
                      magazineId,
                      year,
                      52
                    )
                  }}
                >
                  52号
                </button>

                <button
                  type="button"
                  className={
                    selected === 53
                      ? 'active'
                      : ''
                  }
                  onClick={(e) => {
                    e.stopPropagation()
                    updateWeeklyIssueRule(
                      magazineId,
                      year,
                      53
                    )
                  }}
                >
                  53号
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default WeeklyIssueRulesPage
