import DataActionMenu from '../components/DataActionMenu'
import ImageView from '../components/ImageView'

function TimelineIndexPage({
  magazineList,
  seriesList,
  getMagazineCover,
  onBackupData,
  onImportData,
  navigate
}) {
  const hasTimelineEvent = (series) => {
    return Boolean(
      (Number(series.startIssueYear) &&
        Number(series.startIssue)) ||
        (Number(series.completedIssueYear) &&
          Number(series.completedIssue))
    )
  }

  const totalTimelineCount =
    seriesList.filter(hasTimelineEvent).length

  const timelineMagazines =
    magazineList
      .map((magazine) => {
        const timelineCount =
          seriesList.filter((series) => {
            return (
              series.magazineId === magazine.id &&
              hasTimelineEvent(series)
            )
          }).length

        return {
          ...magazine,
          timelineCount
        }
      })
      .filter((magazine) => {
        return magazine.timelineCount > 0
      })

  return (
    <div className="app">
      <div className="page-title-row">
        <div className="title">
          年表
        </div>

        <DataActionMenu
          onBackupData={onBackupData}
          onImportData={onImportData}
        />
      </div>

      <div className="completed-magazine-list">
        {totalTimelineCount > 0 && (
          <div
            className="completed-magazine-card completed-all-card"
            onClick={() =>
              navigate('/timeline/all')
            }
          >
            <div className="magazine-cover completed-all-cover">
              <div className="no-image">
                ALL
              </div>
            </div>

            <div className="magazine-info">
              <div className="magazine-title">
                全雑誌
              </div>

              <div className="magazine-stat">
                年表対象
                <span>
                  {totalTimelineCount}作品
                </span>
              </div>
            </div>

            <div className="completed-magazine-arrow">
              ›
            </div>
          </div>
        )}

        {timelineMagazines.map((magazine) => {
          const coverImage =
            getMagazineCover(magazine)

          return (
            <div
              key={magazine.id}
              className="completed-magazine-card"
              onClick={() =>
                navigate(
                  `/timeline/${magazine.id}`
                )
              }
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
                  年表対象
                  <span>
                    {magazine.timelineCount}作品
                  </span>
                </div>
              </div>

              <div className="completed-magazine-arrow">
                ›
              </div>
            </div>
          )
        })}
      </div>

      <div className="bottom-nav">
        <button
          onClick={() =>
            navigate('/')
          }
        >
          雑誌
        </button>

        <button
          onClick={() =>
            navigate('/completed')
          }
        >
          完結
        </button>

        <button>
          年表
        </button>
      </div>
    </div>
  )
}

export default TimelineIndexPage
