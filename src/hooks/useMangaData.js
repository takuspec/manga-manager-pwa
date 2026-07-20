import { useEffect, useState } from 'react'
import {
  defaultMagazines,
  defaultSeries
} from '../data/defaultData'
import {
  todayString,
  getEstimatedLatestIssueInfo,
  getHartaYearMonthFromVolume,
  getIssueSerial,
  getNextIssue,
  getNextPublishedIssue,
  getPrevPublishedIssue,
  normalizeSeriesPublicationPace,
  normalizeWeeklyMergedIssuePairs
} from '../utils/issueUtils'
import {
  normalizeHartaGroup
} from '../utils/hartaGroups'
import {
  cleanupUnusedImages,
  dataUrlToBlob,
  deleteImage,
  getImageBackupEntries,
  getImageBlob,
  getImageStorageStats,
  blobToDataUrl,
  restoreImageBackupEntries,
  saveImageBlob
} from '../utils/imageDb'

const MAGAZINE_STORAGE_KEY = 'magazines-v3'
const SERIES_STORAGE_KEY = 'series-v2'
const IMAGE_MIGRATION_COMPLETE_KEY =
  'image-migration-complete-v1'
const LEGACY_IMAGE_MIGRATION_LIMIT = 5
const SPLIT_BACKUP_PART_MAX_BYTES =
  80 * 1024 * 1024

let hasShownStorageAlert = false

function normalizeSeriesStatus(value) {
  if (
    value === 'completed' ||
    value === 'paused'
  ) {
    return value
  }

  return 'ongoing'
}

function isImageDataUrl(value) {
  return (
    typeof value === 'string' &&
    value.startsWith('data:image/')
  )
}

function createBackupTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
}

function downloadJsonFile(data, fileName) {
  const blob =
    new Blob(
      [
        JSON.stringify(
          data,
          null,
          2
        )
      ],
      {
        type: 'application/json'
      }
    )

  const url =
    URL.createObjectURL(blob)

  const link =
    document.createElement('a')

  link.href = url
  link.download = fileName

  document.body.appendChild(link)
  link.click()
  link.remove()

  URL.revokeObjectURL(url)
}

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader =
      new FileReader()

    reader.onload = () => {
      try {
        resolve(
          JSON.parse(reader.result)
        )
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = () => {
      reject(reader.error)
    }

    reader.readAsText(file)
  })
}

function getImportedLists(data) {
  return {
    importedMagazines:
      data.magazines ||
      data.magazineList ||
      data[MAGAZINE_STORAGE_KEY] ||
      data.storage?.[MAGAZINE_STORAGE_KEY],
    importedSeries:
      data.series ||
      data.seriesList ||
      data[SERIES_STORAGE_KEY] ||
      data.storage?.[SERIES_STORAGE_KEY]
  }
}

async function saveImageValue(imageValue) {
  if (!imageValue) {
    return ''
  }

  if (imageValue instanceof Blob) {
    return saveImageBlob(imageValue)
  }

  if (isImageDataUrl(imageValue)) {
    return saveImageBlob(
      dataUrlToBlob(imageValue)
    )
  }

  return ''
}

function collectUsedImageIds(
  magazineList,
  seriesList
) {
  return [
    ...magazineList.map((item) => {
      return item.imageId
    }),
    ...seriesList.map((item) => {
      return item.imageId
    })
  ].filter(Boolean)
}

function normalizeSeriesItem(item) {
  const hasCompletedIssue =
    Object.prototype.hasOwnProperty.call(
      item,
      'completedIssue'
    )

  const hasCompletedIssueYear =
    Object.prototype.hasOwnProperty.call(
      item,
      'completedIssueYear'
    )

  const fallbackYear =
    item.issueYear ||
    new Date().getFullYear()

  const fallbackIssue =
    item.status === 'completed'
      ? Number(item.issue) || 0
      : 0

  return {
    ...item,
    author: item.author || '',
    storyAuthor: item.storyAuthor || '',
    artAuthor: item.artAuthor || '',
    status: normalizeSeriesStatus(item.status),
    completedIssueYear:
      hasCompletedIssueYear &&
      item.completedIssueYear
        ? item.completedIssueYear
        : fallbackYear,
    completedIssue:
      hasCompletedIssue
        ? Number(item.completedIssue) || 0
        : fallbackIssue,
    publicationPace:
      normalizeSeriesPublicationPace(
        item.publicationPace
      )
  }
}

function safeSetLocalStorage(
  key,
  value
) {
  try {
    localStorage.setItem(
      key,
      value
    )
  } catch (error) {
    console.error(error)

    if (!hasShownStorageAlert) {
      hasShownStorageAlert = true
      window.alert(
        '保存容量が上限に達しました。画像を減らすかバックアップしてください。'
      )
    }
  }
}

function safeSetLocalStorageWithDiagnostics(
  key,
  value,
  onError
) {
  const sizeKB =
    new Blob([value]).size / 1024

  console.log(
    `${key} size KB:`,
    sizeKB.toFixed(1)
  )

  if (value.includes('data:image/')) {
    console.warn(
      `${key} still contains image DataURL data.`
    )
  }

  try {
    localStorage.setItem(
      key,
      value
    )
  } catch (error) {
    console.error(error)

    if (!hasShownStorageAlert) {
      hasShownStorageAlert = true
      const message =
        '保存容量が上限に達しました。画像を減らすかバックアップしてください。'

      onError?.(message)

      window.alert(message)
    }
  }
}

function waitForIdle() {
  return new Promise((resolve) => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(resolve, {
        timeout: 800
      })
      return
    }

    window.setTimeout(resolve, 0)
  })
}

async function migrateLegacyImagesInListSafely(
  list,
  budget = {
    count: 0,
    limit: Infinity
  }
) {
  let changed = false
  let hasRemaining = false
  const nextList = []

  for (const item of list) {
    if (
      item.imageId ||
      !isImageDataUrl(item.image)
    ) {
      nextList.push(item)
      continue
    }

    if (budget.count >= budget.limit) {
      hasRemaining = true
      nextList.push(item)
      continue
    }

    await waitForIdle()

    try {
      const imageId =
        await saveImageValue(item.image)

      budget.count += 1
      changed = true

      nextList.push({
        ...item,
        imageId,
        image: ''
      })
    } catch (error) {
      console.error(error)
      hasRemaining = true
      nextList.push(item)
    }
  }

  return {
    list: nextList,
    changed,
    hasRemaining
  }
}

function useMangaData({
  navigate,
  selectedSeriesIds,
  setSelectedSeriesIds,
  bulkIssueYear,
  bulkIssueValue,
  setBulkIssueValue
}) {
  const [magazineList, setMagazineList] =
    useState(() => {
      const saved =
        localStorage.getItem(
          MAGAZINE_STORAGE_KEY
        )

      return saved
        ? JSON.parse(saved)
        : defaultMagazines
    })

  const [seriesList, setSeriesList] =
    useState(() => {
      const saved =
        localStorage.getItem(
          SERIES_STORAGE_KEY
        )

      return saved
        ? JSON.parse(saved).map(normalizeSeriesItem)
        : defaultSeries.map(normalizeSeriesItem)
    })

  const [
    storageErrorMessage,
    setStorageErrorMessage
  ] = useState('')

  useEffect(() => {
    let cancelled = false

    const migrateImages = async () => {
      if (
        localStorage.getItem(
          IMAGE_MIGRATION_COMPLETE_KEY
        ) === 'true'
      ) {
        return
      }

      const budget = {
        count: 0,
        limit: LEGACY_IMAGE_MIGRATION_LIMIT
      }

      const migratedMagazines =
        await migrateLegacyImagesInListSafely(
          magazineList,
          budget
        )

      const migratedSeries =
        await migrateLegacyImagesInListSafely(
          seriesList,
          budget
        )

      if (cancelled) {
        return
      }

      if (migratedMagazines.changed) {
        setMagazineList(
          migratedMagazines.list
        )
      }

      if (migratedSeries.changed) {
        setSeriesList(
          migratedSeries.list
        )
      }

      await cleanupUnusedImages(
        collectUsedImageIds(
          migratedMagazines.list,
          migratedSeries.list
        )
      )

      const hasRemaining =
        migratedMagazines.hasRemaining ||
        migratedSeries.hasRemaining

      if (!hasRemaining) {
        localStorage.setItem(
          IMAGE_MIGRATION_COMPLETE_KEY,
          'true'
        )
      }

      const stats =
        await getImageStorageStats()

      console.log(
        'image storage:',
        stats
      )
    }

    migrateImages().catch((error) => {
      console.error(error)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    safeSetLocalStorageWithDiagnostics(
      MAGAZINE_STORAGE_KEY,
      JSON.stringify(magazineList),
      setStorageErrorMessage
    )
  }, [magazineList])

  useEffect(() => {
    safeSetLocalStorageWithDiagnostics(
      SERIES_STORAGE_KEY,
      JSON.stringify(seriesList),
      setStorageErrorMessage
    )
  }, [seriesList])

  const addMagazine = (newMagazineName, setNewMagazineName) => {
    if (newMagazineName.trim() === '') {
      return
    }

    const newMagazine = {
      id: Date.now(),
      name: newMagazineName,
      frequency: 'weekly',
      releaseDay: 1,
      releaseDate: 1,
      baseDate: todayString(),
      baseIssue: 1,
      weeklyIssueRules: {},
      imageId: '',
      image: ''
    }

    setMagazineList((prevList) => [
      ...prevList,
      newMagazine
    ])

    setNewMagazineName('')
  }

  const saveMagazineEdit = async (
    magazineId,
    newName,
    frequency,
    releaseDay,
    releaseDate,
    currentIssueYear,
    currentIssue,
    imageBlob,
    oldImageId
  ) => {
    const newImageId =
      await saveImageValue(imageBlob)

    setMagazineList((prevList) =>
      prevList.map((magazine) => {
        if (magazine.id !== magazineId) {
          return magazine
        }

        return {
          ...magazine,
          name: newName,
          frequency: frequency,
          releaseDay: releaseDay,
          releaseDate: releaseDate,
          baseIssueYear: currentIssueYear,
          baseIssue: currentIssue,
          baseDate: todayString(),
          ...(newImageId
            ? {
                imageId: newImageId,
                image: ''
              }
            : {})
        }
      })
    )

    if (
      newImageId &&
      oldImageId &&
      oldImageId !== newImageId
    ) {
      await deleteImage(oldImageId)
    }
  }

  const getSeriesMagazine = (series) => {
    return magazineList.find((magazine) => {
      return magazine.id === series.magazineId
    })
  }

  const getSeriesStartReadIssue = (
    series
  ) => {
    const startIssue =
      Number(series.startIssue) || 0

    if (!startIssue) {
      return null
    }

    return {
      year:
        Number(series.startIssueYear) ||
        Number(series.issueYear) ||
        new Date().getFullYear(),
      issue: startIssue
    }
  }

  const getLatestReadableIssueForSeries = (
    series,
    magazine
  ) => {
    let latest =
      getEstimatedLatestIssueInfo(magazine)

    if (magazine?.frequency === 'harta') {
      const afterLatest =
        getNextIssue(
          latest.year,
          latest.issue,
          magazine
        )

      latest =
        getPrevPublishedIssue(
          series,
          afterLatest.year,
          afterLatest.issue,
          magazine
        )
    }

    const completedIssue =
      Number(series.completedIssue) || 0

    if (!completedIssue) {
      return latest
    }

    const completedLimit = {
      year:
        Number(series.completedIssueYear) ||
        Number(series.issueYear) ||
        latest.year,
      issue: completedIssue
    }

    const latestSerial =
      getIssueSerial(
        latest.year,
        latest.issue,
        magazine
      )

    const completedSerial =
      getIssueSerial(
        completedLimit.year,
        completedLimit.issue,
        magazine
      )

    return completedSerial < latestSerial
      ? completedLimit
      : latest
  }

  const normalizeReadIssueForSeries = (
    series,
    magazine,
    year,
    issue
  ) => {
    const numericIssue =
      Number(issue) || 0

    const start =
      getSeriesStartReadIssue(series)

    const normalizedYear =
      Number(year) ||
      Number(series.issueYear) ||
      start?.year ||
      new Date().getFullYear()

    if (!numericIssue) {
      return {
        year: normalizedYear,
        issue: 0
      }
    }

    if (!magazine) {
      return {
        year: normalizedYear,
        issue: numericIssue
      }
    }

    const latest =
      getLatestReadableIssueForSeries(
        series,
        magazine
      )

    const readSerial =
      getIssueSerial(
        normalizedYear,
        numericIssue,
        magazine
      )

    const latestSerial =
      getIssueSerial(
        latest.year,
        latest.issue,
        magazine
      )

    if (!start) {
      return readSerial > latestSerial
        ? latest
        : {
            year: normalizedYear,
            issue: numericIssue
          }
    }

    const startSerial =
      getIssueSerial(
        start.year,
        start.issue,
        magazine
      )

    if (latestSerial < startSerial) {
      return {
        year: start.year,
        issue: 0
      }
    }

    if (readSerial < startSerial) {
      return start
    }

    if (readSerial > latestSerial) {
      return latest
    }

    return {
      year: normalizedYear,
      issue: numericIssue
    }
  }

  const getNextReadIssueForSeries = (
    series,
    magazine
  ) => {
    const start =
      getSeriesStartReadIssue(series)

    const currentIssue =
      Number(series.issue) || 0

    if (!currentIssue && start) {
      return normalizeReadIssueForSeries(
        series,
        magazine,
        start.year,
        start.issue
      )
    }

    if (!magazine) {
      return null
    }

    const currentYear =
      Number(series.issueYear) ||
      start?.year ||
      new Date().getFullYear()

    if (start) {
      const currentSerial =
        getIssueSerial(
          currentYear,
          currentIssue,
          magazine
        )

      const startSerial =
        getIssueSerial(
          start.year,
          start.issue,
          magazine
        )

      if (currentSerial < startSerial) {
        return start
      }
    }

    const next =
      getNextPublishedIssue(
        series,
        currentYear,
        currentIssue,
        magazine
      )

    return normalizeReadIssueForSeries(
      series,
      magazine,
      next.year,
      next.issue
    )
  }

  const getPrevReadIssueForSeries = (
    series,
    magazine
  ) => {
    const start =
      getSeriesStartReadIssue(series)

    const currentIssue =
      Number(series.issue) || 0

    if (!currentIssue) {
      return null
    }

    if (!magazine) {
      return null
    }

    const currentYear =
      Number(series.issueYear) ||
      start?.year ||
      new Date().getFullYear()

    if (start) {
      const currentSerial =
        getIssueSerial(
          currentYear,
          currentIssue,
          magazine
        )

      const startSerial =
        getIssueSerial(
          start.year,
          start.issue,
          magazine
        )

      if (currentSerial <= startSerial) {
        return {
          year: start.year,
          issue: 0
        }
      }
    }

    const prev =
      getPrevPublishedIssue(
        series,
        currentYear,
        currentIssue,
        magazine
      )

    if (start) {
      const prevSerial =
        getIssueSerial(
          prev.year,
          prev.issue,
          magazine
        )

      const startSerial =
        getIssueSerial(
          start.year,
          start.issue,
          magazine
        )

      if (prevSerial < startSerial) {
        return {
          year: start.year,
          issue: 0
        }
      }
    }

    return normalizeReadIssueForSeries(
      series,
      magazine,
      prev.year,
      prev.issue
    )
  }

  const deleteMagazine = (magazineId) => {
    const imageIdsToDelete = [
      ...magazineList
        .filter((magazine) => {
          return magazine.id === magazineId
        })
        .map((magazine) => {
          return magazine.imageId
        }),
      ...seriesList
        .filter((item) => {
          return item.magazineId === magazineId
        })
        .map((item) => {
          return item.imageId
        })
    ].filter(Boolean)

    setMagazineList((prevList) =>
      prevList.filter((magazine) => {
        return magazine.id !== magazineId
      })
    )

    setSeriesList((prevList) =>
      prevList.filter((item) => {
        return item.magazineId !== magazineId
      })
    )

    imageIdsToDelete.forEach((imageId) => {
      deleteImage(imageId).catch((error) => {
        console.error(error)
      })
    })

    navigate('/')
  }

  const moveMagazine = (
    fromIndex,
    toIndex
  ) => {
    setMagazineList((prevList) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prevList.length ||
        toIndex >= prevList.length
      ) {
        return prevList
      }

      const nextList = [...prevList]
      const [movedMagazine] =
        nextList.splice(fromIndex, 1)

      nextList.splice(
        toIndex,
        0,
        movedMagazine
      )

      return nextList
    })
  }

  const handleMagazineImageUpload =
    async (e, magazineId) => {
      const file = e.target.files[0]

      if (!file) {
        return
      }

      const newImageId =
        await saveImageBlob(file)

      let oldImageId = ''

      setMagazineList((prevList) =>
        prevList.map((magazine) => {
          if (magazine.id !== magazineId) {
            return magazine
          }

          oldImageId =
            magazine.imageId || ''

          return {
            ...magazine,
            imageId: newImageId,
            image: ''
          }
        })
      )

      if (oldImageId) {
        await deleteImage(oldImageId)
      }
    }

  const saveCroppedMagazineImage = async (
    magazineId,
    croppedImage,
    oldImageId
  ) => {
    const newImageId =
      await saveImageValue(croppedImage)

    if (!newImageId) {
      return
    }

    setMagazineList((prevList) =>
      prevList.map((magazine) => {
        return magazine.id === magazineId
          ? {
              ...magazine,
              imageId: newImageId,
              image: ''
            }
          : magazine
      })
    )

    if (
      oldImageId &&
      oldImageId !== newImageId
    ) {
      await deleteImage(oldImageId)
    }
  }

  const saveNewSeries = async ({
    magazineId,
    newSeriesTitle,
    newSeriesAuthor,
    newSeriesStoryAuthor,
    newSeriesArtAuthor,
    newSeriesStartIssueYear,
    newSeriesStartIssue,
    newSeriesIssueYear,
    newSeriesIssue,
    newSeriesCompletedIssueYear,
    newSeriesCompletedIssue,
    newSeriesImage,
    newSeriesPublicationPace,
    setNewSeriesTitle,
    setNewSeriesAuthor,
    setNewSeriesStoryAuthor,
    setNewSeriesArtAuthor,
    setNewSeriesHartaGroup,
    setNewSeriesStartIssueYear,
    setNewSeriesStartIssue,
    setNewSeriesIssueYear,
    setNewSeriesIssue,
    setNewSeriesCompletedIssueYear,
    setNewSeriesCompletedIssue,
    newSeriesHartaGroup,
    setNewSeriesPublicationPace,
    setNewSeriesImage
  }) => {
    if (newSeriesTitle.trim() === '') {
      return
    }

    const magazine =
      magazineList.find((magazine) => {
        return magazine.id === magazineId
      })

    const isHarta =
      magazine?.frequency === 'harta'

    const startIssue =
      Number(newSeriesStartIssue)

    const issue =
      Number(newSeriesIssue)

    const completedIssue =
      Number(newSeriesCompletedIssue) || 0

    const startIssueYear =
      isHarta && startIssue > 0
        ? getHartaYearMonthFromVolume(
            startIssue
          ).year
        : Number(newSeriesStartIssueYear)

    const issueYear =
      isHarta && issue > 0
        ? getHartaYearMonthFromVolume(
            issue
          ).year
        : Number(newSeriesIssueYear)

    const completedIssueYear =
      isHarta && completedIssue > 0
        ? getHartaYearMonthFromVolume(
            completedIssue
          ).year
        : Number(newSeriesCompletedIssueYear)

    const imageId =
      await saveImageValue(newSeriesImage)

    const normalizedReadIssue =
      normalizeReadIssueForSeries(
        {
          magazineId,
          startIssueYear: startIssueYear,
          startIssue: startIssue,
          issueYear: issueYear,
          issue: issue
        },
        magazine,
        issueYear,
        issue
      )

  const newSeries = {
    id: Date.now(),
    title: newSeriesTitle,
    author: newSeriesAuthor.trim(),
    storyAuthor: newSeriesStoryAuthor.trim(),
    artAuthor: newSeriesArtAuthor.trim(),
    magazineId: magazineId,

    startIssueYear: startIssueYear,
    startIssue: startIssue,

    issueYear: normalizedReadIssue.year,
    issue: normalizedReadIssue.issue,

    completedIssueYear: completedIssueYear,
    completedIssue: completedIssue,

    hartaGroup: newSeriesHartaGroup,
    publicationPace:
      normalizeSeriesPublicationPace(
        newSeriesPublicationPace
      ),

    status: 'ongoing',
    imageId: imageId,
    image: ''
  }

    setSeriesList((prevList) => [
      ...prevList,
      newSeries
    ])

    setNewSeriesTitle('')
    setNewSeriesAuthor('')
    setNewSeriesStoryAuthor('')
    setNewSeriesArtAuthor('')
    setNewSeriesStartIssueYear(new Date().getFullYear())
    setNewSeriesStartIssue(1)
    setNewSeriesIssueYear(new Date().getFullYear())
    setNewSeriesIssue(0)
    setNewSeriesCompletedIssueYear(new Date().getFullYear())
    setNewSeriesCompletedIssue(0)
    setNewSeriesHartaGroup('ha')
    setNewSeriesPublicationPace('weekly')
    setNewSeriesImage('')

    navigate(
      `/magazine/${magazineId}`,
      { replace: true }
    )
  }

  const deleteSeries = (id) => {
    const oldImageId =
      seriesList.find((item) => {
        return item.id === id
      })?.imageId

    setSeriesList((prevList) =>
      prevList.filter((item) => {
        return item.id !== id
      })
    )

    if (oldImageId) {
      deleteImage(oldImageId).catch((error) => {
        console.error(error)
      })
    }

    navigate(-1)
  }

  const saveEdit = (
    id,
    editTitle,
    authorFields = {}
  ) => {
    setSeriesList((prevList) =>
      prevList.map((item) => {
        return item.id === id
          ? {
              ...item,
              title: editTitle,
              author:
                authorFields.author ?? item.author ?? '',
              storyAuthor:
                authorFields.storyAuthor ??
                item.storyAuthor ??
                '',
              artAuthor:
                authorFields.artAuthor ??
                item.artAuthor ??
                ''
            }
          : item
      })
    )
  }

  const updateIssueDirect =
    (id, value) => {
      setSeriesList((prevList) =>
        prevList.map((item) => {
          if (item.id !== id) {
            return item
          }

          const magazine =
            getSeriesMagazine(item)

          const normalizedReadIssue =
            normalizeReadIssueForSeries(
              item,
              magazine,
              item.issueYear,
              value
            )

          return {
            ...item,
            issueYear: normalizedReadIssue.year,
            issue: normalizedReadIssue.issue
          }
        })
      )
    }

  const updateIssueYearDirect =
    (id, value) => {
      setSeriesList((prevList) =>
        prevList.map((item) => {
          if (item.id !== id) {
            return item
          }

          const magazine =
            getSeriesMagazine(item)

          const normalizedReadIssue =
            normalizeReadIssueForSeries(
              item,
              magazine,
              value,
              item.issue
            )

          return {
            ...item,
            issueYear: normalizedReadIssue.year,
            issue: normalizedReadIssue.issue
          }
        })
      )
    }

  const updateCompletedIssueDirect =
    (id, year, issue) => {
      setSeriesList((prevList) =>
        prevList.map((item) => {
          return item.id === id
            ? {
                ...item,
                completedIssueYear: year,
                completedIssue: Number(issue) || 0
              }
            : item
        })
      )
    }
  
    const updateStartIssueDirect =
    (id, year, issue) => {
      setSeriesList((prevList) =>
        prevList.map((item) => {
          if (item.id !== id) {
            return item
          }

          const nextItem = {
            ...item,
            startIssueYear: year,
            startIssue: issue
          }

          const magazine =
            getSeriesMagazine(nextItem)

          const normalizedReadIssue =
            normalizeReadIssueForSeries(
              nextItem,
              magazine,
              nextItem.issueYear,
              nextItem.issue
            )

          return {
            ...nextItem,
            issueYear: normalizedReadIssue.year,
            issue: normalizedReadIssue.issue
          }
        })
      )
    }
  
  const updateHartaGroupDirect =
    (id, hartaGroup) => {
      setSeriesList((prevList) =>
        prevList.map((item) => {
          return item.id === id
            ? {
                ...item,
                hartaGroup: hartaGroup
              }
            : item
        })
      )
    }

  const updatePublicationPaceDirect =
    (id, publicationPace) => {
      setSeriesList((prevList) =>
        prevList.map((item) => {
          return item.id === id
            ? {
                ...item,
                publicationPace:
                  normalizeSeriesPublicationPace(
                    publicationPace
                  )
              }
            : item
        })
      )
    }

  const updateWeeklyIssueRule = (
    magazineId,
    year,
    finalIssue
  ) => {
    const normalizedIssue =
      Number(finalIssue) === 53
        ? 53
        : 52

    setMagazineList((prevList) =>
      prevList.map((magazine) => {
        if (magazine.id !== magazineId) {
          return magazine
        }

        return {
          ...magazine,
          weeklyIssueRules: {
            ...(magazine.weeklyIssueRules || {}),
            [year]: normalizedIssue
          }
        }
      })
    )
  }

  const updateWeeklyIssueRules = (
    magazineId,
    rules
  ) => {
    setMagazineList((prevList) =>
      prevList.map((magazine) => {
        if (magazine.id !== magazineId) {
          return magazine
        }

        return {
          ...magazine,
          weeklyIssueRules: {
            ...(magazine.weeklyIssueRules || {}),
            ...rules
          }
        }
      })
    )
  }

  const updateWeeklyMergedIssues = (
    magazineId,
    year,
    issuePairs
  ) => {
    setMagazineList((prevList) =>
      prevList.map((magazine) => {
        if (magazine.id !== magazineId) {
          return magazine
        }

        const normalizedPairs =
          normalizeWeeklyMergedIssuePairs(
            issuePairs,
            magazine,
            year
          )

        return {
          ...magazine,
          weeklyMergedIssues: {
            ...(magazine.weeklyMergedIssues || {}),
            [year]: normalizedPairs
          }
        }
      })
    )
  }

  const toggleWeeklyMergedIssue = (
    magazineId,
    year,
    issue
  ) => {
    const numericIssue =
      Number(issue) || 0

    if (!numericIssue) {
      return
    }

    setMagazineList((prevList) =>
      prevList.map((magazine) => {
        if (magazine.id !== magazineId) {
          return magazine
        }

        const currentIssues =
          Array.isArray(
            magazine.weeklyMergedIssues?.[year]
          )
            ? magazine.weeklyMergedIssues[year]
            : []

        const issueSet =
          new Set(
            currentIssues.map((currentIssue) => {
              return Number(currentIssue) || 0
            })
          )

        if (issueSet.has(numericIssue)) {
          issueSet.delete(numericIssue)
        } else {
          issueSet.add(numericIssue)
        }

        return {
          ...magazine,
          weeklyMergedIssues: {
            ...(magazine.weeklyMergedIssues || {}),
            [year]: Array.from(issueSet)
              .filter((currentIssue) => {
                return currentIssue > 0
              })
              .sort((a, b) => {
                return a - b
              })
          }
        }
      })
    )
  }

  const addIssue = (id) => {
    setSeriesList((prevList) =>
      prevList.map((item) => {
        if (
          item.id !== id ||
          item.status === 'completed' ||
          item.status === 'paused'
        ) {
          return item
        }

        const magazine =
          getSeriesMagazine(item)

        if (!magazine) {
          return item
        }

        const next =
          getNextReadIssueForSeries(
            item,
            magazine
          )

        if (!next) {
          return item
        }

        return {
          ...item,
          issueYear: next.year,
          issue: next.issue
        }
      })
    )
  }

  const minusIssue = (id) => {
    setSeriesList((prevList) =>
      prevList.map((item) => {
        if (
          item.id !== id ||
          item.status === 'completed' ||
          item.status === 'paused'
        ) {
          return item
        }

        const magazine =
          getSeriesMagazine(item)

        if (!magazine) {
          return item
        }

        const prev =
          getPrevReadIssueForSeries(
            item,
            magazine
          )

        if (!prev) {
          return item
        }

        return {
          ...item,
          issueYear: prev.year,
          issue: prev.issue
        }
      })
    )
  }

  const bulkAddIssue = (magazineId) => {
    setSeriesList((prevList) =>
      prevList.map((item) => {
        if (
          item.magazineId !== magazineId ||
          item.status !== 'ongoing'
        ) {
          return item
        }

        const magazine =
          getSeriesMagazine(item)

        if (!magazine) {
          return item
        }

        const next =
          getNextReadIssueForSeries(
            item,
            magazine
          )

        if (!next) {
          return item
        }

        return {
          ...item,
          issueYear: next.year,
          issue: next.issue
        }
      })
    )
  }

  const bulkMinusIssue = (magazineId) => {
    setSeriesList((prevList) =>
      prevList.map((item) => {
        if (
          item.magazineId !== magazineId ||
          item.status !== 'ongoing'
        ) {
          return item
        }

        const magazine =
          getSeriesMagazine(item)

        if (!magazine) {
          return item
        }

        const prev =
          getPrevReadIssueForSeries(
            item,
            magazine
          )

        if (!prev) {
          return item
        }

        return {
          ...item,
          issueYear: prev.year,
          issue: prev.issue
        }
      })
    )
  }

  const bulkAddIssueByHartaGroups = (
    magazineId,
    selectedGroups = []
  ) => {
    const targetMagazine =
      magazineList.find((magazine) => {
        return magazine.id === magazineId
      })

    const targetGroups =
      new Set(
        selectedGroups.map((group) => {
          return normalizeHartaGroup(group)
        })
      )

    if (
      !targetMagazine ||
      targetMagazine.frequency !== 'harta' ||
      targetGroups.size === 0
    ) {
      return
    }

    setSeriesList((prevList) =>
      prevList.map((item) => {
        if (
          item.magazineId !== magazineId ||
          item.status !== 'ongoing' ||
          !targetGroups.has(
            normalizeHartaGroup(
              item.hartaGroup
            )
          )
        ) {
          return item
        }

        const next =
          getNextReadIssueForSeries(
            item,
            targetMagazine
          )

        if (!next) {
          return item
        }

        return {
          ...item,
          issueYear: next.year,
          issue: next.issue
        }
      })
    )
  }

  const bulkMinusIssueByHartaGroups = (
    magazineId,
    selectedGroups = []
  ) => {
    const targetMagazine =
      magazineList.find((magazine) => {
        return magazine.id === magazineId
      })

    const targetGroups =
      new Set(
        selectedGroups.map((group) => {
          return normalizeHartaGroup(group)
        })
      )

    if (
      !targetMagazine ||
      targetMagazine.frequency !== 'harta' ||
      targetGroups.size === 0
    ) {
      return
    }

    setSeriesList((prevList) =>
      prevList.map((item) => {
        if (
          item.magazineId !== magazineId ||
          item.status !== 'ongoing' ||
          !targetGroups.has(
            normalizeHartaGroup(
              item.hartaGroup
            )
          )
        ) {
          return item
        }

        const prev =
          getPrevReadIssueForSeries(
            item,
            targetMagazine
          )

        if (!prev) {
          return item
        }

        return {
          ...item,
          issueYear: prev.year,
          issue: prev.issue
        }
      })
    )
  }

  const toggleStatus = (id) => {
    setSeriesList((prevList) =>
      prevList.map((item) => {
        if (item.id !== id) {
          return item
        }

        const nextStatus =
          item.status === 'completed'
            ? 'ongoing'
            : 'completed'

        const nextItem = {
          ...item,
          status: nextStatus
        }

        if (
          nextStatus === 'completed' &&
          !Number(nextItem.completedIssue)
        ) {
          return {
            ...nextItem,
            completedIssueYear:
              nextItem.issueYear ||
              new Date().getFullYear(),
            completedIssue:
              Number(nextItem.issue) || 0
          }
        }

        return nextItem
      })
    )
  }

  const updateStatus = (
    id,
    status
  ) => {
    setSeriesList((prevList) =>
      prevList.map((item) => {
        if (item.id !== id) {
          return item
        }

        const nextStatus =
          normalizeSeriesStatus(status)

        const nextItem = {
          ...item,
          status: nextStatus
        }

        if (
          nextStatus === 'completed' &&
          !Number(nextItem.completedIssue)
        ) {
          return {
            ...nextItem,
            completedIssueYear:
              nextItem.issueYear ||
              new Date().getFullYear(),
            completedIssue:
              Number(nextItem.issue) || 0
          }
        }

        return nextItem
      })
    )
  }

  const toggleSeriesSelection = (id) => {
    if (selectedSeriesIds.includes(id)) {
      setSelectedSeriesIds(
        selectedSeriesIds.filter((seriesId) => {
          return seriesId !== id
        })
      )

      return
    }

    setSelectedSeriesIds([
      ...selectedSeriesIds,
      id
    ])
  }

  const bulkChangeSelectedIssue = () => {
    if (bulkIssueValue === '') {
      return
    }

    const targetYear =
      Number(bulkIssueYear)

    const targetIssue =
      Number(bulkIssueValue)

    setSeriesList((prevList) =>
      prevList.map((item) => {
        if (
          selectedSeriesIds.includes(item.id)
        ) {
          const magazine =
            getSeriesMagazine(item)

          const normalizedReadIssue =
            normalizeReadIssueForSeries(
              item,
              magazine,
              targetYear,
              targetIssue
            )

          return {
            ...item,
            issueYear: normalizedReadIssue.year,
            issue: normalizedReadIssue.issue
          }
        }

        return item
      })
    )

    setSelectedSeriesIds([])
    setBulkIssueValue('')
  }

  const handleImageUpload = async (e, id) => {
    const file = e.target.files[0]

    if (!file) {
      return
    }

    const newImageId =
      await saveImageBlob(file)

    const oldImageId =
      seriesList.find((item) => {
        return item.id === id
      })?.imageId

    setSeriesList((prevList) =>
      prevList.map((item) => {
        return item.id === id
          ? {
              ...item,
              imageId: newImageId,
              image: ''
            }
          : item
      })
    )

    if (oldImageId) {
      await deleteImage(oldImageId)
    }
  }

  const saveCroppedImage = async (
    id,
    croppedImage,
    oldImageId
  ) => {
    const newImageId =
      await saveImageValue(croppedImage)

    if (!newImageId) {
      return
    }

    setSeriesList((prevList) =>
      prevList.map((item) => {
        return item.id === id
          ? {
              ...item,
              imageId: newImageId,
              image: ''
            }
          : item
      })
    )

    if (
      oldImageId &&
      oldImageId !== newImageId
    ) {
      await deleteImage(oldImageId)
    }
  }

  const backupData = async (
    options = {}
  ) => {
    const usedImageIds =
      collectUsedImageIds(
        magazineList,
        seriesList
      )

    if (options.split) {
      const timestamp =
        createBackupTimestamp()

      const backupId =
        `split_${timestamp}`

      let imagePartIndex = 1
      let imageCount = 0
      let currentImages = []
      let currentPartBytes = 0

      const flushImagePart = () => {
        if (!currentImages.length) {
          return
        }

        downloadJsonFile(
          {
            app: 'manga-manager',
            version: 3,
            backupType: 'split',
            exportedAt:
              new Date().toISOString(),
            splitBackup: {
              id: backupId,
              kind: 'images',
              index: imagePartIndex
            },
            images: currentImages
          },
          `manga-manager-backup-${timestamp}-images-${String(
            imagePartIndex
          ).padStart(3, '0')}.json`
        )

        imagePartIndex += 1
        currentImages = []
        currentPartBytes = 0
      }

      for (const imageId of usedImageIds) {
        const blob =
          await getImageBlob(imageId)

        if (!blob) {
          continue
        }

        const entry = {
          id: imageId,
          type: blob.type,
          dataUrl:
            await blobToDataUrl(blob)
        }

        const entryBytes =
          JSON.stringify(entry).length + 128

        if (
          currentImages.length &&
          currentPartBytes + entryBytes >
            SPLIT_BACKUP_PART_MAX_BYTES
        ) {
          flushImagePart()
        }

        currentImages.push(entry)
        currentPartBytes += entryBytes
        imageCount += 1
      }

      flushImagePart()

      downloadJsonFile(
        {
          app: 'manga-manager',
          version: 3,
          backupType: 'split',
          exportedAt:
            new Date().toISOString(),
          storageKeys: {
            magazines: MAGAZINE_STORAGE_KEY,
            series: SERIES_STORAGE_KEY
          },
          splitBackup: {
            id: backupId,
            kind: 'data',
            imagePartCount:
              imagePartIndex - 1,
            imageCount
          },
          magazines: magazineList,
          series: seriesList
        },
        `manga-manager-backup-${timestamp}-data.json`
      )

      return
    }

    const images =
      await getImageBackupEntries(
        usedImageIds
      )

    const backup = {
      app: 'manga-manager',
      version: 2,
      exportedAt: new Date().toISOString(),
      storageKeys: {
        magazines: MAGAZINE_STORAGE_KEY,
        series: SERIES_STORAGE_KEY
      },
      magazines: magazineList,
      series: seriesList,
      images: images
    }

    const timestamp =
      createBackupTimestamp()

    downloadJsonFile(
      backup,
      `manga-manager-backup-${timestamp}.json`
    )
  }

  const restoreImportedData = async (
    data,
    {
      restoreImages = true
    } = {}
  ) => {
    const {
      importedMagazines,
      importedSeries
    } = getImportedLists(data)

    if (
      !Array.isArray(importedMagazines) ||
      !Array.isArray(importedSeries)
    ) {
      throw new Error(
        'Invalid backup data'
      )
    }

    if (restoreImages) {
      await restoreImageBackupEntries(
        data.images || []
      )
    }

    const nextMagazines =
      await migrateLegacyImagesInListSafely(
        importedMagazines,
        {
          count: 0,
          limit: Infinity
        }
      )

    const nextSeries =
      await migrateLegacyImagesInListSafely(
        importedSeries,
        {
          count: 0,
          limit: Infinity
        }
      )

    const normalizedSeries =
      nextSeries.list.map(
        normalizeSeriesItem
      )

    safeSetLocalStorageWithDiagnostics(
      MAGAZINE_STORAGE_KEY,
      JSON.stringify(nextMagazines.list),
      setStorageErrorMessage
    )

    safeSetLocalStorageWithDiagnostics(
      SERIES_STORAGE_KEY,
      JSON.stringify(normalizedSeries),
      setStorageErrorMessage
    )

    setMagazineList(nextMagazines.list)
    setSeriesList(normalizedSeries)
    setSelectedSeriesIds([])
    setBulkIssueValue('')

    await cleanupUnusedImages(
      collectUsedImageIds(
        nextMagazines.list,
        normalizedSeries
      )
    )

    if (
      !nextMagazines.hasRemaining &&
      !nextSeries.hasRemaining
    ) {
      localStorage.setItem(
        IMAGE_MIGRATION_COMPLETE_KEY,
        'true'
      )
    } else {
      localStorage.removeItem(
        IMAGE_MIGRATION_COMPLETE_KEY
      )
    }
  }

  const importSplitData = async (files) => {
    let dataPart = null
    let backupId = ''
    let restoredImageParts = 0
    const restoredPartIndexes =
      new Set()

    for (const file of files) {
      const data =
        await readJsonFile(file)

      const splitInfo =
        data.splitBackup

      if (
        data.backupType !== 'split' ||
        !splitInfo?.kind
      ) {
        throw new Error(
          '分割バックアップではないファイルが含まれています。'
        )
      }

      if (!backupId) {
        backupId = splitInfo.id
      }

      if (splitInfo.id !== backupId) {
        throw new Error(
          '別々の分割バックアップファイルが混ざっています。'
        )
      }

      if (splitInfo.kind === 'data') {
        dataPart = data
        continue
      }

      if (splitInfo.kind === 'images') {
        await restoreImageBackupEntries(
          data.images || []
        )
        restoredImageParts += 1
        restoredPartIndexes.add(
          splitInfo.index
        )
      }
    }

    if (!dataPart) {
      throw new Error(
        '分割バックアップの本体ファイルが見つかりません。'
      )
    }

    const expectedImageParts =
      dataPart.splitBackup?.imagePartCount || 0

    if (
      restoredPartIndexes.size <
      expectedImageParts
    ) {
      throw new Error(
        `画像ファイルが不足しています。${expectedImageParts}個中${restoredImageParts}個しか選択されていません。`
      )
    }

    await restoreImportedData(
      dataPart,
      {
        restoreImages: false
      }
    )
  }

  const importData = async (fileOrFiles) => {
    const files =
      fileOrFiles instanceof File
        ? [fileOrFiles]
        : Array.from(fileOrFiles || [])

    if (!files.length) {
      return
    }

    if (files.length > 1) {
      await importSplitData(files)
      return
    }

    const data =
      await readJsonFile(files[0])

    if (data.backupType === 'split') {
      if (
        data.splitBackup?.kind === 'data' &&
        !data.splitBackup?.imagePartCount
      ) {
        await restoreImportedData(
          data,
          {
            restoreImages: false
          }
        )
        return
      }

      throw new Error(
        '分割バックアップは本体ファイルと画像ファイルをすべて選択してください。'
      )
    }

    await restoreImportedData(data)
  }

  return {
    magazineList,
    seriesList,
    storageErrorMessage,
    clearStorageErrorMessage: () =>
      setStorageErrorMessage(''),
    addMagazine,
    saveMagazineEdit,
    deleteMagazine,
    moveMagazine,
    handleMagazineImageUpload,
    saveNewSeries,
    deleteSeries,
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
    updateStartIssueDirect,
    saveCroppedImage,
    saveCroppedMagazineImage,
    backupData,
    importData,
    updateWeeklyIssueRule,
    updateWeeklyIssueRules,
    updateWeeklyMergedIssues,
    toggleWeeklyMergedIssue,
    updateHartaGroupDirect,
    updatePublicationPaceDirect,
    handleImageUpload
  }
}

export default useMangaData
