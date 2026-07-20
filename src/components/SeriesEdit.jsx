import ImageCropModal from './ImageCropModal'
import ImageView from './ImageView'
import IssueInputRow from './IssueInputRow'
import { useEffect, useState } from 'react'
import {
  clampIssueForYear,
  getIssueOptions,
  getHartaYearMonthFromVolume,
  getYearOptions,
  normalizeSeriesPublicationPace,
  SERIES_PUBLICATION_PACE_OPTIONS
} from '../utils/issueUtils'

function SeriesEdit({
  magazineList,
  selectedSeries,
  setSelectedSeries,
  editTitle,
  setEditTitle,
  saveEdit,
  updateIssueDirect,
  updateIssueYearDirect,
  updateCompletedIssueDirect,
  updateStartIssueDirect,
  updateHartaGroupDirect,
  updatePublicationPaceDirect,
  handleImageUpload,
  saveCroppedImage
}) {
  const yearOptions =
    getYearOptions()

  const magazine =
    magazineList.find((item) => {
      return item.id === selectedSeries.magazineId
    })

  const isHarta =
    magazine?.frequency === 'harta'

  const isWeekly =
    magazine?.frequency === 'weekly'

  const [localTitle, setLocalTitle] =
    useState(editTitle)

  const [localAuthor, setLocalAuthor] =
    useState(selectedSeries.author || '')

  const [
    localStoryAuthor,
    setLocalStoryAuthor
  ] = useState(selectedSeries.storyAuthor || '')

  const [
    localArtAuthor,
    setLocalArtAuthor
  ] = useState(selectedSeries.artAuthor || '')

  const [localStartIssueYear, setLocalStartIssueYear] =
    useState(
      selectedSeries.startIssueYear ||
        new Date().getFullYear()
    )

  const [localStartIssue, setLocalStartIssue] =
    useState(
      selectedSeries.startIssue || 1
    )

  const [localIssueYear, setLocalIssueYear] =
    useState(
      selectedSeries.issueYear ||
        new Date().getFullYear()
    )

  const [localIssue, setLocalIssue] =
    useState(selectedSeries.issue)

  const [
    localCompletedIssueYear,
    setLocalCompletedIssueYear
  ] = useState(
    selectedSeries.completedIssueYear ||
      selectedSeries.issueYear ||
      new Date().getFullYear()
  )

  const [
    localCompletedIssue,
    setLocalCompletedIssue
  ] = useState(
    selectedSeries.completedIssue || 0
  )

  const startIssueOptions =
    getIssueOptions(
      magazine,
      localStartIssueYear
    )

  const readIssueOptions =
    getIssueOptions(
      magazine,
      localIssueYear,
      {
        includeUnread: true
      }
    )

  const completedIssueOptions =
    getIssueOptions(
      magazine,
      localCompletedIssueYear,
      {
        includeUnread: true,
        unreadLabel: '未完'
      }
    )

  const [localImage, setLocalImage] =
    useState(selectedSeries.image || '')

  const [
    localImageBlob,
    setLocalImageBlob
  ] = useState(null)

  const [
    localHartaGroup,
    setLocalHartaGroup
  ] = useState(
    selectedSeries.hartaGroup || 'ha'
  )

  const [
    localPublicationPace,
    setLocalPublicationPace
  ] = useState(
    normalizeSeriesPublicationPace(
      selectedSeries.publicationPace
    )
  )

  const [showCropModal, setShowCropModal] =
    useState(false)

  const [cropTargetImage, setCropTargetImage] =
    useState(null)

  useEffect(() => {
    setLocalTitle(editTitle)

    setLocalAuthor(
      selectedSeries.author || ''
    )

    setLocalStoryAuthor(
      selectedSeries.storyAuthor || ''
    )

    setLocalArtAuthor(
      selectedSeries.artAuthor || ''
    )

    setLocalImage(
      selectedSeries.image || ''
    )

    setLocalImageBlob(null)

    setLocalStartIssueYear(
      selectedSeries.startIssueYear ||
        new Date().getFullYear()
    )

    setLocalStartIssue(
      selectedSeries.startIssue || 1
    )

    setLocalIssueYear(
      selectedSeries.issueYear ||
        new Date().getFullYear()
    )

    setLocalIssue(selectedSeries.issue)

    setLocalCompletedIssueYear(
      selectedSeries.completedIssueYear ||
        selectedSeries.issueYear ||
        new Date().getFullYear()
    )

    setLocalCompletedIssue(
      selectedSeries.completedIssue || 0
    )

    setLocalHartaGroup(
      selectedSeries.hartaGroup || 'ha'
    )

    setLocalPublicationPace(
      normalizeSeriesPublicationPace(
        selectedSeries.publicationPace
      )
    )
  }, [editTitle, selectedSeries])

  const handleSave = async () => {
    const startIssue =
      Number(localStartIssue)

    const issue =
      Number(localIssue)

    const completedIssue =
      Number(localCompletedIssue) || 0

    const startIssueYear =
      isHarta && startIssue > 0
        ? getHartaYearMonthFromVolume(
            startIssue
          ).year
        : Number(localStartIssueYear)

    const issueYear =
      isHarta && issue > 0
        ? getHartaYearMonthFromVolume(
            issue
          ).year
        : Number(localIssueYear)

    const completedIssueYear =
      isHarta && completedIssue > 0
        ? getHartaYearMonthFromVolume(
            completedIssue
          ).year
        : Number(localCompletedIssueYear)

    setEditTitle(localTitle)

    saveEdit(
      selectedSeries.id,
      localTitle,
      {
        author: localAuthor.trim(),
        storyAuthor:
          localStoryAuthor.trim(),
        artAuthor: localArtAuthor.trim()
      }
    )

    updateStartIssueDirect(
      selectedSeries.id,
      startIssueYear,
      startIssue
    )

    updateIssueYearDirect(
      selectedSeries.id,
      issueYear
    )

    updateIssueDirect(
      selectedSeries.id,
      issue
    )

    updateCompletedIssueDirect(
      selectedSeries.id,
      completedIssueYear,
      completedIssue
    )

    await saveCroppedImage(
      selectedSeries.id,
      localImageBlob,
      selectedSeries.imageId
    )

    updateHartaGroupDirect(
      selectedSeries.id,
      localHartaGroup
    )

    updatePublicationPaceDirect(
      selectedSeries.id,
      localPublicationPace
    )

    setSelectedSeries(null)
  }

  const handleStartIssueYearChange = (year) => {
    setLocalStartIssueYear(year)

    setLocalStartIssue(
      clampIssueForYear(
        magazine,
        year,
        localStartIssue
      )
    )
  }

  const handleIssueYearChange = (year) => {
    setLocalIssueYear(year)

    setLocalIssue(
      clampIssueForYear(
        magazine,
        year,
        localIssue,
        {
          includeUnread: true
        }
      )
    )
  }

  const handleCompletedIssueYearChange = (year) => {
    setLocalCompletedIssueYear(year)

    setLocalCompletedIssue(
      clampIssueForYear(
        magazine,
        year,
        localCompletedIssue,
        {
          includeUnread: true
        }
      )
    )
  }

  return (
    <div className="app">

      <div className="edit-header">
        <button
          className="back-icon-button"
          onClick={() =>
            setSelectedSeries(null)
          }
        >
          ←
        </button>

        <div className="edit-title">
          作品編集
        </div>
      </div>

      <div className="edit-page">

        <div className="cover large">
          <ImageView
            imageId={selectedSeries.imageId}
            imageBlob={localImageBlob}
            fallbackImage={localImage}
          />
        </div>

        <div className="image-upload-area">
          <input
            type="file"
            accept="image/*"
            onClick={(e) => {
              e.target.value = ''
            }}
            onChange={(e) => {
              const file =
                e.target.files?.[0]

              if (!file) {
                return
              }

              const reader =
                new FileReader()

              reader.onload = () => {
                setCropTargetImage(
                  reader.result
                )

                setShowCropModal(true)
              }

              reader.readAsDataURL(file)
            }}
          />
        </div>

        <div className="edit-group">
          <div>連載名</div>

          <input
            value={localTitle}
            onChange={(e) =>
              setLocalTitle(e.target.value)
            }
          />
        </div>

        <div className="edit-group">
          <div>連載開始</div>

          <IssueInputRow
            yearValue={localStartIssueYear}
            onYearChange={setLocalStartIssueYear}
            issueValue={localStartIssue}
            onIssueChange={setLocalStartIssue}
            yearOptions={yearOptions}
            issueOptions={startIssueOptions}
            showYear={!isHarta}
            useIssueSelect={!isHarta}
            prefix={isHarta ? 'volume' : ''}
            suffix={isHarta ? '' : undefined}
            onYearSelected={
              handleStartIssueYearChange
            }
          />
        </div>

        <div className="edit-group">
          <div>作者</div>

          <input
            value={localAuthor}
            placeholder="作者"
            onChange={(e) =>
              setLocalAuthor(e.target.value)
            }
          />
        </div>

        <div className="edit-group">
          <div>原作</div>

          <input
            value={localStoryAuthor}
            placeholder="原作が別の場合"
            onChange={(e) =>
              setLocalStoryAuthor(
                e.target.value
              )
            }
          />
        </div>

        <div className="edit-group">
          <div>作画</div>

          <input
            value={localArtAuthor}
            placeholder="作画が別の場合"
            onChange={(e) =>
              setLocalArtAuthor(
                e.target.value
              )
            }
          />
        </div>

        <div className="edit-group">
          <div>読了</div>

          <IssueInputRow
            yearValue={localIssueYear}
            onYearChange={setLocalIssueYear}
            issueValue={localIssue}
            onIssueChange={setLocalIssue}
            yearOptions={yearOptions}
            issueOptions={readIssueOptions}
            showYear={!isHarta}
            useIssueSelect={!isHarta}
            prefix={isHarta ? 'volume' : ''}
            suffix={isHarta ? '' : undefined}
            onYearSelected={
              handleIssueYearChange
            }
          />
        </div>

        <div className="edit-group">
          <div>完結</div>

          <IssueInputRow
            yearValue={localCompletedIssueYear}
            onYearChange={setLocalCompletedIssueYear}
            issueValue={localCompletedIssue}
            onIssueChange={setLocalCompletedIssue}
            yearOptions={yearOptions}
            issueOptions={completedIssueOptions}
            showYear={!isHarta}
            useIssueSelect={!isHarta}
            prefix={isHarta ? 'volume' : ''}
            suffix={isHarta ? '' : undefined}
            issuePlaceholder={isHarta ? '未完' : ''}
            onYearSelected={
              handleCompletedIssueYearChange
            }
          />
        </div>

        {isHarta && (
          <div className="edit-group">
            <div>掲載区分</div>

            <select
              value={localHartaGroup}
              onChange={(e) =>
                setLocalHartaGroup(
                  e.target.value
                )
              }
            >
              <option value="ha">
                は組（毎号掲載）
              </option>

              <option value="ru">
                る組（偶数号）
              </option>

              <option value="ta">
                た組（奇数号）
              </option>
            </select>
          </div>
        )}

        {isWeekly && (
          <div className="edit-group">
            <div>掲載ペース</div>

            <select
              value={localPublicationPace}
              onChange={(e) =>
                setLocalPublicationPace(
                  e.target.value
                )
              }
            >
              {SERIES_PUBLICATION_PACE_OPTIONS.map(
                (option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                )
              )}
            </select>
          </div>
        )}

        {showCropModal && (
          <ImageCropModal
            image={cropTargetImage}
            onSave={(croppedImage) => {
              setLocalImageBlob(croppedImage)

              setShowCropModal(false)
              setCropTargetImage(null)
            }}
            onCancel={() => {
              setShowCropModal(false)
              setCropTargetImage(null)
            }}
          />
        )}

        <button
          className="save-button"
          onClick={handleSave}
        >
          保存
        </button>

      </div>
    </div>
  )
}

export default SeriesEdit
