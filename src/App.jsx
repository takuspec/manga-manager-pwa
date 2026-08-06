import { useState } from 'react'
import {
  Routes,
  Route,
  useNavigate,
  useParams
} from 'react-router-dom'
import './App.css'

import MagazineListPage from './pages/MagazineListPage'
import MagazineSeriesPage from './pages/MagazineSeriesPage'
import MagazineEditPage from './pages/MagazineEditPage'
import CompletedPage from './pages/CompletedPage'
import SeriesAddPage from './pages/SeriesAddPage'
import SeriesEditPage from './pages/SeriesEditPage'
import AuthorSeriesPage from './pages/AuthorSeriesPage'
import AuthorSelectPage from './pages/AuthorSelectPage'
import useMangaData from './hooks/useMangaData'
import CompletedSeriesPage from './pages/CompletedSeriesPage'
import WeeklySettingsPage from './pages/WeeklySettingsPage'
import WeeklyIssueRulesPage from './pages/WeeklyIssueRulesPage'
import WeeklyMergedIssuesPage from './pages/WeeklyMergedIssuesPage'
import TimelineIndexPage from './pages/TimelineIndexPage'
import TimelinePage from './pages/TimelinePage'

import {
  getEstimatedLatestIssue,
  getEstimatedLatestIssueInfo,
  getUnreadIssueCount
} from './utils/issueUtils'

const SERIES_SORT_SETTINGS_KEY =
  'manga-manager-series-sort-settings'
const SERIES_VISIBILITY_SETTINGS_KEY =
  'manga-manager-series-visibility-settings'

const primarySeriesSortModeValues = [
  'unread',
  'read',
  'title',
  'start',
  'duration'
]

const secondarySeriesSortModeValues = [
  ...primarySeriesSortModeValues,
  'none'
]

const seriesSortDirectionValues = [
  'asc',
  'desc'
]

const defaultSeriesSortSettings = {
  sortMode: 'unread',
  sortDirection: 'desc',
  secondarySortMode: 'title',
  secondarySortDirection: 'asc'
}

const normalizeSeriesSortSettings = (value) => {
  const source =
    value && typeof value === 'object'
      ? value
      : {}

  const sortMode =
    primarySeriesSortModeValues.includes(
      source.sortMode
    )
      ? source.sortMode
      : defaultSeriesSortSettings.sortMode

  const sortDirection =
    seriesSortDirectionValues.includes(
      source.sortDirection
    )
      ? source.sortDirection
      : defaultSeriesSortSettings.sortDirection

  const secondarySortMode =
    secondarySeriesSortModeValues.includes(
      source.secondarySortMode
    )
      ? source.secondarySortMode
      : defaultSeriesSortSettings.secondarySortMode

  const secondarySortDirection =
    seriesSortDirectionValues.includes(
      source.secondarySortDirection
    )
      ? source.secondarySortDirection
      : defaultSeriesSortSettings.secondarySortDirection

  return {
    sortMode,
    sortDirection,
    secondarySortMode,
    secondarySortDirection
  }
}

const getInitialSeriesSortSettings = () => {
  try {
    const rawValue =
      localStorage.getItem(
        SERIES_SORT_SETTINGS_KEY
      )

    return normalizeSeriesSortSettings(
      rawValue ? JSON.parse(rawValue) : null
    )
  } catch (error) {
    console.error(error)
    return defaultSeriesSortSettings
  }
}

const defaultSeriesVisibilitySettings = {
  showCompleted: true,
  showUnreadZeroOngoing: true
}

const normalizeSeriesVisibilitySettings = (value) => {
  const source =
    value && typeof value === 'object'
      ? value
      : {}

  return {
    showCompleted:
      typeof source.showCompleted === 'boolean'
        ? source.showCompleted
        : defaultSeriesVisibilitySettings.showCompleted,
    showUnreadZeroOngoing:
      typeof source.showUnreadZeroOngoing === 'boolean'
        ? source.showUnreadZeroOngoing
        : defaultSeriesVisibilitySettings.showUnreadZeroOngoing
  }
}

const getInitialSeriesVisibilitySettings = () => {
  try {
    const rawValue =
      localStorage.getItem(
        SERIES_VISIBILITY_SETTINGS_KEY
      )

    return normalizeSeriesVisibilitySettings(
      rawValue ? JSON.parse(rawValue) : null
    )
  } catch (error) {
    console.error(error)
    return defaultSeriesVisibilitySettings
  }
}

function App() {
  const navigate = useNavigate()

  const [viewMode, setViewMode] =
    useState('list')

  const [
    seriesSortSettings,
    setSeriesSortSettings
  ] = useState(getInitialSeriesSortSettings)

  const {
    sortMode,
    sortDirection,
    secondarySortMode,
    secondarySortDirection
  } = seriesSortSettings

  const updateSeriesSortSettings = (patch) => {
    setSeriesSortSettings((prev) =>
      normalizeSeriesSortSettings({
        ...prev,
        ...patch
      })
    )
  }

  const setSortMode = (value) => {
    updateSeriesSortSettings({
      sortMode: value
    })
  }

  const setSortDirection = (value) => {
    updateSeriesSortSettings({
      sortDirection: value
    })
  }

  const setSecondarySortMode = (value) => {
    updateSeriesSortSettings({
      secondarySortMode: value
    })
  }

  const setSecondarySortDirection = (value) => {
    updateSeriesSortSettings({
      secondarySortDirection: value
    })
  }

  const saveDefaultSeriesSort = () => {
    localStorage.setItem(
      SERIES_SORT_SETTINGS_KEY,
      JSON.stringify(seriesSortSettings)
    )
  }

  const [
    seriesVisibilitySettings,
    setSeriesVisibilitySettings
  ] = useState(getInitialSeriesVisibilitySettings)

  const {
    showCompleted,
    showUnreadZeroOngoing
  } = seriesVisibilitySettings

  const updateSeriesVisibilitySettings = (patch) => {
    setSeriesVisibilitySettings((prev) => {
      const next =
        normalizeSeriesVisibilitySettings({
          ...prev,
          ...patch
        })

      localStorage.setItem(
        SERIES_VISIBILITY_SETTINGS_KEY,
        JSON.stringify(next)
      )

      return next
    })
  }

  const setShowCompleted = (value) => {
    updateSeriesVisibilitySettings({
      showCompleted:
        typeof value === 'function'
          ? value(showCompleted)
          : value
    })
  }

  const setShowUnreadZeroOngoing = (value) => {
    updateSeriesVisibilitySettings({
      showUnreadZeroOngoing:
        typeof value === 'function'
          ? value(showUnreadZeroOngoing)
          : value
    })
  }

  const [menuSeriesId, setMenuSeriesId] =
    useState(null)

  const [selectedSeriesIds, setSelectedSeriesIds] =
    useState([])

  const [bulkIssueValue, setBulkIssueValue] =
    useState('')

  const [bulkIssueYear, setBulkIssueYear] =
    useState(new Date().getFullYear())

  const [newMagazineName, setNewMagazineName] =
    useState('')

  const [newSeriesTitle, setNewSeriesTitle] =
    useState('')

  const [
    newSeriesAuthor,
    setNewSeriesAuthor
  ] = useState('')

  const [
    newSeriesStoryAuthor,
    setNewSeriesStoryAuthor
  ] = useState('')

  const [
    newSeriesArtAuthor,
    setNewSeriesArtAuthor
  ] = useState('')

  const [
    newSeriesScriptAuthor,
    setNewSeriesScriptAuthor
  ] = useState('')

  const [
    newSeriesStartIssueYear,
    setNewSeriesStartIssueYear
  ] = useState(new Date().getFullYear())

  const [
    newSeriesStartIssue,
    setNewSeriesStartIssue
  ] = useState(1)

  const [
    newSeriesIssueYear,
    setNewSeriesIssueYear
  ] = useState(new Date().getFullYear())

  const [newSeriesIssue, setNewSeriesIssue] =
    useState(0)

  const [
    newSeriesCompletedIssueYear,
    setNewSeriesCompletedIssueYear
  ] = useState(new Date().getFullYear())

  const [
    newSeriesCompletedIssue,
    setNewSeriesCompletedIssue
  ] = useState(0)

  const [
    newSeriesHartaGroup,
    setNewSeriesHartaGroup
  ] = useState('ha')

  const [
    newSeriesPublicationPace,
    setNewSeriesPublicationPace
  ] = useState('weekly')

  const [newSeriesImage, setNewSeriesImage] =
    useState('')

  const [editTitle, setEditTitle] =
    useState('')

  const {
    magazineList,
    seriesList,
    storageErrorMessage,
    clearStorageErrorMessage,
    addMagazine,
    saveMagazineEdit,
    deleteMagazine,
    moveMagazine,
    handleMagazineImageUpload,
    saveNewSeries,
    deleteSeries,
    updateStartIssueDirect,
    updateHartaGroupDirect,
    updatePublicationPaceDirect,
    saveEdit,
    updateIssueDirect,
    updateIssueYearDirect,
    updateCompletedIssueDirect,
    addIssue,
    minusIssue,
    bulkAddIssue,
    bulkMinusIssue,
    bulkAddIssueByHartaGroups,
    bulkMinusIssueByHartaGroups,
    toggleStatus,
    updateStatus,
    toggleSeriesSelection,
    bulkChangeSelectedIssue,
    saveCroppedImage,
    saveCroppedMagazineImage,
    backupData,
    importData,
    updateWeeklyIssueRule,
    updateWeeklyIssueRules,
    updateWeeklyMergedIssues,
    toggleWeeklyMergedIssue,
    handleImageUpload
  } = useMangaData({
    navigate,
    setSelectedSeriesIds,
    selectedSeriesIds,
    bulkIssueValue,
    bulkIssueYear,
    setBulkIssueValue
  })

  const getMagazineName = (magazineId) => {
    const magazine =
      magazineList.find((item) => {
        return item.id === magazineId
      })

    return magazine
      ? magazine.name
      : '不明な雑誌'
  }

  const getUnreadCount = (item) => {
    const magazine =
      magazineList.find((magazine) => {
        return magazine.id === item.magazineId
      })

    if (
      !magazine ||
      item.status === 'completed' ||
      item.status === 'paused'
    ) {
      return 0
    }

    const latest =
      getEstimatedLatestIssueInfo(magazine)

    return getUnreadIssueCount(
      item,
      magazine,
      latest
    )
  }

  const getMagazineCover = (magazine) => {
    if (
      magazine.imageId ||
      magazine.image
    ) {
      return {
        imageId: magazine.imageId || '',
        image: magazine.image || ''
      }
    }

    const firstSeriesWithImage =
      seriesList.find((item) => {
        return (
          item.magazineId === magazine.id &&
          (
            item.imageId ||
            item.image
          )
        )
      })

    return firstSeriesWithImage
      ? {
          imageId:
            firstSeriesWithImage.imageId || '',
          image:
            firstSeriesWithImage.image || ''
        }
      : {
          imageId: '',
          image: ''
        }
  }

  return (
    <>
    {storageErrorMessage && (
      <div className="storage-error-banner">
        <span>
          {storageErrorMessage}
        </span>

        <button
          type="button"
          onClick={clearStorageErrorMessage}
        >
          閉じる
        </button>
      </div>
    )}

    <Routes>

      <Route
        path="/"
        element={
          <MagazineListPage
            magazineList={magazineList}
            seriesList={seriesList}
            newMagazineName={newMagazineName}
            setNewMagazineName={setNewMagazineName}
            addMagazine={() =>
              addMagazine(
                newMagazineName,
                setNewMagazineName
              )
            }
            getUnreadCount={getUnreadCount}
            getMagazineCover={getMagazineCover}
            getEstimatedLatestIssue={
              getEstimatedLatestIssue
            }
            onBackupData={backupData}
            onImportData={importData}
            moveMagazine={moveMagazine}
            navigate={navigate}
          />
        }
      />

      <Route
        path="/magazine/:magazineId"
        element={
          <MagazineSeriesPage
            magazineList={magazineList}
            seriesList={seriesList}
            viewMode={viewMode}
            setViewMode={setViewMode}
            sortMode={sortMode}
            setSortMode={setSortMode}
            sortDirection={sortDirection}
            setSortDirection={setSortDirection}
            secondarySortMode={secondarySortMode}
            setSecondarySortMode={
              setSecondarySortMode
            }
            secondarySortDirection={
              secondarySortDirection
            }
            setSecondarySortDirection={
              setSecondarySortDirection
            }
            saveDefaultSeriesSort={
              saveDefaultSeriesSort
            }
            showCompleted={showCompleted}
            setShowCompleted={setShowCompleted}
            showUnreadZeroOngoing={
              showUnreadZeroOngoing
            }
            setShowUnreadZeroOngoing={
              setShowUnreadZeroOngoing
            }
            menuSeriesId={menuSeriesId}
            setMenuSeriesId={setMenuSeriesId}
            selectedSeriesIds={selectedSeriesIds}
            setSelectedSeriesIds={
              setSelectedSeriesIds
            }
            bulkIssueValue={bulkIssueValue}
            setBulkIssueValue={setBulkIssueValue}
            bulkIssueYear={bulkIssueYear}
            setBulkIssueYear={setBulkIssueYear}
            getUnreadCount={getUnreadCount}
            getEstimatedLatestIssue={
              getEstimatedLatestIssue
            }
            addIssue={addIssue}
            minusIssue={minusIssue}
            bulkAddIssue={bulkAddIssue}
            bulkMinusIssue={bulkMinusIssue}
            bulkAddIssueByHartaGroups={
              bulkAddIssueByHartaGroups
            }
            bulkMinusIssueByHartaGroups={
              bulkMinusIssueByHartaGroups
            }
            bulkChangeSelectedIssue={
              bulkChangeSelectedIssue
            }
            toggleSeriesSelection={
              toggleSeriesSelection
            }
            toggleStatus={toggleStatus}
            updateStatus={updateStatus}
            deleteSeries={deleteSeries}
            navigate={navigate}
            useParams={useParams}
          />
        }
      />

      <Route
        path="/magazine/:magazineId/edit"
        element={
          <MagazineEditPage
            magazineList={magazineList}
            getEstimatedLatestIssue={
              getEstimatedLatestIssue
            }
            saveMagazineEdit={saveMagazineEdit}
            deleteMagazine={deleteMagazine}
            handleMagazineImageUpload={
              handleMagazineImageUpload
            }
            saveCroppedMagazineImage={
              saveCroppedMagazineImage
            }
            navigate={navigate}
            useParams={useParams}
          />
        }
      />

      <Route
        path="/timeline"
        element={
          <TimelineIndexPage
            magazineList={magazineList}
            seriesList={seriesList}
            getMagazineCover={getMagazineCover}
            onBackupData={backupData}
            onImportData={importData}
            navigate={navigate}
          />
        }
      />

      <Route
        path="/timeline/:magazineId"
        element={
          <TimelinePage
            magazineList={magazineList}
            seriesList={seriesList}
            navigate={navigate}
          />
        }
      />

      <Route
        path="/authors"
        element={
          <AuthorSeriesPage
            magazineList={magazineList}
            seriesList={seriesList}
            navigate={navigate}
          />
        }
      />

      <Route
        path="/authors/select/:seriesId"
        element={
          <AuthorSelectPage
            seriesList={seriesList}
            navigate={navigate}
            useParams={useParams}
          />
        }
      />

      <Route
        path="/weekly-settings"
        element={
          <WeeklySettingsPage
            magazineList={magazineList}
            navigate={navigate}
          />
        }
      />

      <Route
        path="/weekly-settings/:magazineId"
        element={
          <WeeklyIssueRulesPage
            magazineList={magazineList}
            updateWeeklyIssueRule={
              updateWeeklyIssueRule
            }
            updateWeeklyIssueRules={
              updateWeeklyIssueRules
            }
            navigate={navigate}
          />
        }
      />

      <Route
        path="/weekly-settings/:magazineId/:year"
        element={
          <WeeklyMergedIssuesPage
            magazineList={magazineList}
            updateWeeklyIssueRule={
              updateWeeklyIssueRule
            }
            updateWeeklyMergedIssues={
              updateWeeklyMergedIssues
            }
            toggleWeeklyMergedIssue={
              toggleWeeklyMergedIssue
            }
            navigate={navigate}
          />
        }
      />

      <Route
        path="/completed"
        element={
          <CompletedPage
            magazineList={magazineList}
            seriesList={seriesList}
            getMagazineCover={getMagazineCover}
            onBackupData={backupData}
            onImportData={importData}
            navigate={navigate}
          />
        }
      />

      <Route
        path="/completed/:magazineId"
        element={
          <CompletedSeriesPage
            magazineList={magazineList}
            seriesList={seriesList}
            navigate={navigate}
          />
        }
      />

      <Route
        path="/magazine/:magazineId/add"
        element={
          <SeriesAddPage
            magazineList={magazineList}
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
            setNewSeriesImage={setNewSeriesImage}
            newSeriesHartaGroup={newSeriesHartaGroup}
            setNewSeriesHartaGroup={setNewSeriesHartaGroup}
            newSeriesPublicationPace={
              newSeriesPublicationPace
            }
            setNewSeriesPublicationPace={
              setNewSeriesPublicationPace
            }
            saveNewSeries={(magazineId) =>
              saveNewSeries({
                magazineId,
                newSeriesTitle,
                newSeriesAuthor,
                newSeriesStoryAuthor,
                newSeriesArtAuthor,
                newSeriesScriptAuthor,
                newSeriesStartIssueYear,
                newSeriesStartIssue,
                newSeriesIssueYear,
                newSeriesIssue,
                newSeriesCompletedIssueYear,
                newSeriesCompletedIssue,
                newSeriesImage,
                newSeriesHartaGroup,
                newSeriesPublicationPace,
                setNewSeriesTitle,
                setNewSeriesAuthor,
                setNewSeriesStoryAuthor,
                setNewSeriesArtAuthor,
                setNewSeriesScriptAuthor,
                setNewSeriesStartIssueYear,
                setNewSeriesStartIssue,
                setNewSeriesIssueYear,
                setNewSeriesIssue,
                setNewSeriesCompletedIssueYear,
                setNewSeriesCompletedIssue,
                setNewSeriesHartaGroup,
                setNewSeriesPublicationPace,
                setNewSeriesImage
              })
            }
            navigate={navigate}
          />
        }
      />

      <Route
        path="/series/:seriesId"
        element={
          <SeriesEditPage
            magazineList={magazineList}
            seriesList={seriesList}
            editTitle={editTitle}
            setEditTitle={setEditTitle}
            saveEdit={saveEdit}
            updateIssueDirect={updateIssueDirect}
            updateIssueYearDirect={updateIssueYearDirect}
            updateCompletedIssueDirect={
              updateCompletedIssueDirect
            }
            updateStartIssueDirect={updateStartIssueDirect}
            updateHartaGroupDirect={updateHartaGroupDirect}
            updatePublicationPaceDirect={
              updatePublicationPaceDirect
            }
            handleImageUpload={handleImageUpload}
            saveCroppedImage={saveCroppedImage}
            navigate={navigate}
          />
        }
      />

    </Routes>
    </>
  )
}

export default App
