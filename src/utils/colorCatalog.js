// カラーページの「号の一覧」と「作品の一覧」を、アプリに登録済みの
// 雑誌・作品のデータから作る。
//
// ・号の一覧: 雑誌の号数の決まり（52・53号、合併号）から、開始号〜最新号を並べる
// ・作品の一覧: 開始号以降に連載していた作品（始まりはそれより前でもよい）
//
// クラウドには保存しない。アプリ側で作品を追加・修正すれば、そのまま反映される。

import {
  getEstimatedLatestIssueInfo,
  getIssueSerial,
  getWeeklyFinalIssue,
  getWeeklyMergedIssuePairs,
  isSeriesPublishedInIssue
} from './issueUtils.js'
import {
  findCropPreset,
  issueFolder,
  parseIssueFolder
} from './colorLibrary.js'

// 号の一覧を始める号。雑誌ごとに決める（未設定の雑誌は一覧を作らない）。
const CATALOG_STARTS = {
  jump: { year: 2018, issue: 41 }
}

export function getCatalogStart(colorMagazine) {
  const preset =
    findCropPreset(
      colorMagazine?.name,
      colorMagazine?.slug
    )

  return preset
    ? CATALOG_STARTS[preset.id] || null
    : null
}

// カラーページの雑誌に対応する、アプリ側の雑誌
export function findAppMagazine(
  colorMagazine,
  magazineList
) {
  if (!colorMagazine) {
    return null
  }

  const exact =
    magazineList.find(
      (magazine) =>
        magazine.name === colorMagazine.name
    )

  if (exact) {
    return exact
  }

  const preset =
    findCropPreset(
      colorMagazine.name,
      colorMagazine.slug
    )

  if (!preset) {
    return null
  }

  return (
    magazineList.find(
      (magazine) =>
        findCropPreset(magazine.name, '')
          ?.id === preset.id
    ) || null
  )
}

function compareIssue(a, b) {
  return a.year - b.year || a.issue - b.issue
}

// 号の一覧を作れる状態か。作れるなら開始号と最新号を返す。
export function getCatalogRange(
  colorMagazine,
  appMagazine,
  today = new Date()
) {
  const start = getCatalogStart(colorMagazine)

  if (
    !start ||
    appMagazine?.frequency !== 'weekly'
  ) {
    return null
  }

  const latest =
    getEstimatedLatestIssueInfo(
      appMagazine,
      today
    )

  if (
    !latest?.year ||
    compareIssue(latest, start) < 0
  ) {
    return null
  }

  return {
    start,
    latest
  }
}

export function getCatalogYears(range) {
  if (!range) {
    return []
  }

  const years = []

  for (
    let year = range.latest.year;
    year >= range.start.year;
    year -= 1
  ) {
    years.push(year)
  }

  return years
}

// その年の号（フォルダ名）を、範囲内のものだけ番号順に返す。
// 合併号は1つ（例: "04-05"）にまとめる。
export function listCatalogIssues(
  appMagazine,
  year,
  range
) {
  if (
    !range ||
    year < range.start.year ||
    year > range.latest.year
  ) {
    return []
  }

  const finalIssue =
    getWeeklyFinalIssue(appMagazine, year)

  const pairs =
    getWeeklyMergedIssuePairs(
      appMagazine,
      year
    )

  const firstIssue =
    year === range.start.year
      ? range.start.issue
      : 1

  const lastIssue =
    year === range.latest.year
      ? range.latest.issue
      : finalIssue

  const folders = []

  for (
    let issue = 1;
    issue <= finalIssue;
    issue += 1
  ) {
    const pair =
      pairs.find(
        ([first, second]) =>
          first === issue || second === issue
      )

    if (pair && issue === pair[1]) {
      continue
    }

    const end = pair ? pair[1] : issue

    if (end < firstIssue || issue > lastIssue) {
      continue
    }

    folders.push(
      issueFolder({
        start: issue,
        end: pair ? pair[1] : null
      })
    )
  }

  return folders
}

// 作品ごとの、連載の始まりと終わり（号の通し番号）
function getSeriesSpan(series, appMagazine) {
  const startYear =
    Number(series.startIssueYear) || 0

  const startIssue =
    Number(series.startIssue) || 0

  const endYear =
    Number(series.completedIssueYear) || 0

  const endIssue =
    Number(series.completedIssue) || 0

  const ended =
    series.status === 'completed' &&
    endYear > 0 &&
    endIssue > 0

  return {
    start:
      startYear && startIssue
        ? getIssueSerial(
            startYear,
            startIssue,
            appMagazine
          )
        : -Infinity,
    end: ended
      ? getIssueSerial(
          endYear,
          endIssue,
          appMagazine
        )
      : Infinity
  }
}

function seriesOf(seriesList, appMagazine) {
  return seriesList.filter(
    (series) =>
      appMagazine &&
      series.magazineId === appMagazine.id &&
      String(series.title || '').trim()
  )
}

function uniqueTitles(list) {
  return Array.from(
    new Set(
      list.map((series) =>
        String(series.title).trim()
      )
    )
  )
}

// 開始号以降に連載していた作品の名前（名前順）
export function listCatalogSeries(
  seriesList,
  appMagazine,
  range
) {
  if (!range) {
    return []
  }

  const from =
    getIssueSerial(
      range.start.year,
      range.start.issue,
      appMagazine
    )

  return uniqueTitles(
    seriesOf(seriesList, appMagazine).filter(
      (series) =>
        getSeriesSpan(series, appMagazine)
          .end >= from
    )
  ).sort((a, b) => a.localeCompare(b, 'ja'))
}

// その号に載っていた作品の名前（名前順）。
// 連載期間に入っていて、隔週・月1などの掲載ペースでも載る号のもの。
export function listSeriesInIssue(
  seriesList,
  appMagazine,
  year,
  folder
) {
  const issue = parseIssueFolder(folder)

  if (!appMagazine || !issue) {
    return []
  }

  const numbers =
    issue.end === null
      ? [issue.start]
      : [issue.start, issue.end]

  const first =
    getIssueSerial(year, issue.start, appMagazine)

  const last =
    getIssueSerial(
      year,
      issue.end ?? issue.start,
      appMagazine
    )

  return uniqueTitles(
    seriesOf(seriesList, appMagazine).filter(
      (series) => {
        const span =
          getSeriesSpan(series, appMagazine)

        return (
          span.start <= last &&
          span.end >= first &&
          numbers.some((number) =>
            isSeriesPublishedInIssue(
              series,
              year,
              number,
              appMagazine
            )
          )
        )
      }
    )
  ).sort((a, b) => a.localeCompare(b, 'ja'))
}
