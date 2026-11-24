// 作品ごとのカラー年表（1年分の号をマス目で並べる）を作る

import {
  getEstimatedLatestIssueInfo
} from './issueUtils.js'
import {
  listCatalogIssues,
  listSeriesInIssue
} from './colorCatalog.js'
import {
  compareIssueFolders,
  normalizeKind,
  parseIssueFolder
} from './colorLibrary.js'

function folderHas(folder, number) {
  const issue = parseIssueFolder(folder)

  return Boolean(
    issue &&
      number &&
      (issue.start === number ||
        issue.end === number)
  )
}

// 年表に出す年（古い順）。連載期間と、画像のある年を合わせる
export function listTimelineYears(
  series,
  images,
  latestYear
) {
  const years =
    images.map((image) => Number(image.year))

  const startYear =
    Number(series?.startIssueYear) || 0

  if (startYear) {
    const endYear =
      series?.status === 'completed' &&
      Number(series?.completedIssueYear)
        ? Number(series.completedIssueYear)
        : latestYear || startYear

    for (
      let year = startYear;
      year <= endYear;
      year += 1
    ) {
      years.push(year)
    }
  }

  return Array.from(
    new Set(years.filter(Boolean))
  ).sort((a, b) => a - b)
}

// 1年分のマス目。images は listSeriesImages の結果（year・folder 付き）
export function buildTimeline({
  appMagazine,
  seriesList,
  series,
  title,
  year,
  images,
  today = new Date()
}) {
  const ofYear =
    images.filter(
      (image) => Number(image.year) === year
    )

  const byFolder = new Map()

  for (const image of ofYear) {
    byFolder.set(image.folder, [
      ...(byFolder.get(image.folder) || []),
      image
    ])
  }

  const folders = new Set(byFolder.keys())

  if (appMagazine?.frequency === 'weekly') {
    for (const folder of listCatalogIssues(
      appMagazine,
      year,
      {
        start: { year, issue: 1 },
        latest: { year, issue: 999 }
      }
    )) {
      folders.add(folder)
    }
  }

  const latest =
    appMagazine
      ? getEstimatedLatestIssueInfo(
          appMagazine,
          today
        )
      : null

  const startYear = Number(series?.startIssueYear)
  const startIssue = Number(series?.startIssue)
  const ended = series?.status === 'completed'
  const endYear = Number(series?.completedIssueYear)
  const endIssue = Number(series?.completedIssue)

  const summary = {
    cover: 0,
    opening: 0,
    center: 0,
    colorIssues: 0,
    published: 0
  }

  const cells =
    Array.from(folders)
      .sort(compareIssueFolders)
      .map((folder) => {
        const list = byFolder.get(folder) || []

        const kinds =
          new Set(
            list.map((image) =>
              normalizeKind(image.kind)
            )
          )

        const issue = parseIssueFolder(folder)

        const future = Boolean(
          latest &&
            (year > latest.year ||
              (year === latest.year &&
                issue &&
                issue.start > latest.issue))
        )

        // 連載データがある作品は、その号に載っていたかを連載期間・休載から決める。
        // ない作品（読み切りなど）は、画像のある号だけを載っていた号とする
        const published =
          list.length > 0 ||
          (!future &&
            series &&
            appMagazine &&
            listSeriesInIssue(
              seriesList,
              appMagazine,
              year,
              folder
            ).includes(title))

        const cell = {
          folder,
          label:
            issue && issue.end !== null
              ? `${issue.start}・${issue.end}`
              : String(issue?.start ?? folder),
          images: list,
          cover: kinds.has('cover'),
          opening: kinds.has('opening'),
          center: kinds.has('center'),
          other: kinds.has('other'),
          start:
            startYear === year &&
            folderHas(folder, startIssue),
          end:
            ended &&
            endYear === year &&
            folderHas(folder, endIssue),
          published: Boolean(published),
          // 連載データがない作品では、画像のない号を点線にしない
          outside:
            !published &&
            Boolean(series) &&
            list.length === 0
        }

        if (cell.published) {
          summary.published += 1
        }

        if (list.length > 0) {
          summary.colorIssues += 1
        }

        if (cell.cover) summary.cover += 1
        if (cell.opening) summary.opening += 1
        if (cell.center) summary.center += 1

        return cell
      })

  return {
    cells,
    summary
  }
}
