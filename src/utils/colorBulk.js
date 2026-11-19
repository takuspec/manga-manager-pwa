// 何号分もまとめて取り込むときの、号の振り分けと候補作り（画面に依存しない部分）

import {
  getCatalogYears,
  listCatalogIssues,
  listSeriesInIssue,
  PINNED_TAGS
} from './colorCatalog.js'
import {
  issueFolder,
  parseIssueFolder
} from './colorLibrary.js'

// 号の一覧（古い順）。年をまたいで1列に並べる
export function buildIssueSequence(
  appMagazine,
  range
) {
  return getCatalogYears(range)
    .slice()
    .sort((a, b) => a - b)
    .flatMap((year) =>
      listCatalogIssues(
        appMagazine,
        year,
        range
      ).map((folder) => ({
        year,
        folder
      }))
    )
}

// 始まりの号から、direction（-1: 古い号へ、1: 新しい号へ）に count 号分。
// 号の一覧がない雑誌は、号数を1つずつ動かす（年の境目は 52号と1号で区切る）。
export function nextIssues(
  sequence,
  start,
  direction,
  count
) {
  const result = []

  const position =
    sequence.findIndex(
      (item) =>
        item.year === start.year &&
        item.folder === start.folder
    )

  if (position >= 0) {
    for (let k = 0; k < count; k += 1) {
      const item =
        sequence[position + k * direction]

      result.push(item || null)
    }

    return result
  }

  let year = start.year
  let number =
    parseIssueFolder(start.folder)?.start || 1

  for (let k = 0; k < count; k += 1) {
    result.push({
      year,
      folder: issueFolder({
        start: number,
        end: null
      })
    })

    number += direction

    if (number < 1) {
      year -= 1
      number = 52
    } else if (number > 53) {
      year += 1
      number = 1
    }
  }

  return result
}

// AI の答えで、どこから次の号かを決める。表紙の画像から新しい号を始める
export function splitStarts(pages) {
  return pages.map(
    (page, index) =>
      index === 0 || page?.type === 'cover'
  )
}

// starts（各画像が号の始まりか）から、画像の番号の組を作る
export function groupByStarts(starts) {
  const groups = []

  starts.forEach((isStart, index) => {
    if (isStart || groups.length === 0) {
      groups.push([])
    }

    groups[groups.length - 1].push(index)
  })

  return groups
}

// AI に渡す作品の候補。対象の号に載っていた作品と、読み切り・合併号
export function collectCandidates(
  seriesList,
  appMagazine,
  issues
) {
  const titles = new Set(PINNED_TAGS)

  for (const issue of issues) {
    if (!issue) {
      continue
    }

    for (const title of listSeriesInIssue(
      seriesList,
      appMagazine,
      issue.year,
      issue.folder
    )) {
      titles.add(title)
    }
  }

  return Array.from(titles)
}
