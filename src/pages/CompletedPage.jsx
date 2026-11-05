import PrimaryNav from '../components/PrimaryNav'
import DataActionMenu from '../components/DataActionMenu'
import ImageView from '../components/ImageView'

function CompletedPage({
  magazineList,
  seriesList,
  getMagazineCover,
  onBackupData,
  onImportData,
  navigate
}) {
  const totalCompletedCount =
    seriesList.filter((item) => {
      return item.status === 'completed'
    }).length

  const completedMagazines =
    magazineList
      .map((magazine) => {
        const completedCount =
          seriesList.filter((item) => {
            return (
              item.magazineId === magazine.id &&
              item.status === 'completed'
            )
          }).length

        return {
          ...magazine,
          completedCount: completedCount
        }
      })
      .filter((magazine) => {
        return magazine.completedCount > 0
      })

  return (
    <div className="app">

      <div className="page-title-row">
      <div className="title">
        完結一覧
      </div>

      <DataActionMenu
        onBackupData={onBackupData}
        onImportData={onImportData}
      />
      </div>

      <div className="completed-magazine-list">

        {totalCompletedCount > 0 && (
          <div
            className="completed-magazine-card completed-all-card"
            onClick={() =>
              navigate('/completed/all')
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
                完結作品
                <span>
                  {totalCompletedCount}作品
                </span>
              </div>

            </div>

            <div className="completed-magazine-arrow">
              ›
            </div>

          </div>
        )}

        {completedMagazines.map((magazine) => {
          const coverImage =
            getMagazineCover(magazine)

          return (
            <div
              key={magazine.id}
              className="completed-magazine-card"
              onClick={() =>
                navigate(
                  `/completed/${magazine.id}`
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
                  完結作品
                  <span>
                    {magazine.completedCount}作品
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

      <PrimaryNav current="/completed" navigate={navigate} />

    </div>
  )
}

export default CompletedPage
