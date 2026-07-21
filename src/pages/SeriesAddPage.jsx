import { useParams } from 'react-router-dom'
import SeriesAdd from '../components/SeriesAdd'

function SeriesAddPage({
  magazineList,
  newSeriesTitle,
  setNewSeriesTitle,
  newSeriesAuthor,
  setNewSeriesAuthor,
  newSeriesStoryAuthor,
  setNewSeriesStoryAuthor,
  newSeriesArtAuthor,
  setNewSeriesArtAuthor,
  newSeriesScriptAuthor,
  setNewSeriesScriptAuthor,
  newSeriesHartaGroup,
  setNewSeriesHartaGroup,
  newSeriesPublicationPace,
  setNewSeriesPublicationPace,
  newSeriesStartIssueYear,
  setNewSeriesStartIssueYear,
  newSeriesStartIssue,
  setNewSeriesStartIssue,
  newSeriesIssueYear,
  setNewSeriesIssueYear,
  newSeriesIssue,
  setNewSeriesIssue,
  newSeriesCompletedIssueYear,
  setNewSeriesCompletedIssueYear,
  newSeriesCompletedIssue,
  setNewSeriesCompletedIssue,
  newSeriesImage,
  setNewSeriesImage,
  saveNewSeries,
  navigate
}) {
  const params = useParams()

  const magazineId =
    Number(params.magazineId)

  const magazine =
    magazineList.find((item) => {
      return item.id === magazineId
    })

  if (!magazine) {
    return (
      <div className="app">

        <button
          onClick={() =>
            navigate('/')
          }
        >
          ← 雑誌一覧へ
        </button>

        <div className="title">
          雑誌が見つかりません
        </div>

      </div>
    )
  }

  return (
    <SeriesAdd
      newSeriesTitle={newSeriesTitle}
      setNewSeriesTitle={setNewSeriesTitle}
      newSeriesAuthor={newSeriesAuthor}
      setNewSeriesAuthor={setNewSeriesAuthor}
      newSeriesStoryAuthor={
        newSeriesStoryAuthor
      }
      setNewSeriesStoryAuthor={
        setNewSeriesStoryAuthor
      }
      newSeriesArtAuthor={newSeriesArtAuthor}
      setNewSeriesArtAuthor={
        setNewSeriesArtAuthor
      }
      newSeriesScriptAuthor={
        newSeriesScriptAuthor
      }
      setNewSeriesScriptAuthor={
        setNewSeriesScriptAuthor
      }
      newSeriesStartIssueYear={newSeriesStartIssueYear}
      setNewSeriesStartIssueYear={setNewSeriesStartIssueYear}
      newSeriesStartIssue={newSeriesStartIssue}
      setNewSeriesStartIssue={setNewSeriesStartIssue}
      newSeriesIssueYear={newSeriesIssueYear}
      setNewSeriesIssueYear={setNewSeriesIssueYear}
      newSeriesIssue={newSeriesIssue}
      setNewSeriesIssue={setNewSeriesIssue}
      newSeriesCompletedIssueYear={
        newSeriesCompletedIssueYear
      }
      setNewSeriesCompletedIssueYear={
        setNewSeriesCompletedIssueYear
      }
      newSeriesCompletedIssue={
        newSeriesCompletedIssue
      }
      setNewSeriesCompletedIssue={
        setNewSeriesCompletedIssue
      }
      newSeriesImage={newSeriesImage}
      newSeriesHartaGroup={newSeriesHartaGroup}
      setNewSeriesHartaGroup={setNewSeriesHartaGroup}
      newSeriesPublicationPace={
        newSeriesPublicationPace
      }
      setNewSeriesPublicationPace={
        setNewSeriesPublicationPace
      }
      setNewSeriesImage={setNewSeriesImage}
      magazine={magazine}
      saveNewSeries={() =>
        saveNewSeries(magazineId)
      }
      goBack={() =>
        navigate(
          `/magazine/${magazineId}`,
          { replace: true }
        )
      }
    />
  )
}

export default SeriesAddPage
