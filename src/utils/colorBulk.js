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

// 選んだ画像を撮った順に並べる。
// iPhone・iPad の写真の名前（IMG_1234 など）の番号順。名前で決まらなければ更新日時の順。
// どちらでも決まらなければ、選んだ順のまま。
export function sortByShotOrder(files) {
  const list = Array.from(files)

  const parse = (name) => {
    const match =
      /^(.*?)(\d+)(\D*)$/.exec(String(name || ''))

    return match
      ? {
          prefix: match[1],
          number: Number(match[2])
        }
      : null
  }

  const parsed = list.map((file) => parse(file.name))

  const names =
    new Set(list.map((file) => file.name))

  if (
    parsed.every(Boolean) &&
    names.size === list.length
  ) {
    return list
      .map((file, index) => ({
        file,
        key: parsed[index]
      }))
      .sort(
        (a, b) =>
          a.key.prefix.localeCompare(b.key.prefix) ||
          a.key.number - b.key.number
      )
      .map((item) => item.file)
  }

  const times =
    new Set(list.map((file) => file.lastModified))

  if (times.size === list.length) {
    return list
      .slice()
      .sort((a, b) => a.lastModified - b.lastModified)
  }

  return list
}

// 表紙の作品と同じ作品のカラーは巻頭カラー、ほかはセンターカラーにする。
// entries: 号の中の順に [{ id, kind, series, spreadId }]（保存しない画像は除く）
// 作品が分からない画像と、表紙の作品が分からない号は、そのまま。
export function refineKindsBySeries(entries) {
  const coverSeries =
    new Set(
      entries
        .filter((entry) => entry.kind === 'cover')
        .flatMap((entry) => entry.series)
    )

  if (coverSeries.size === 0) {
    return entries.map((entry) => entry.kind)
  }

  const byId = new Map(
    entries.map((entry) => [entry.id, entry])
  )

  return entries.map((entry) => {
    if (
      entry.kind !== 'opening' &&
      entry.kind !== 'center'
    ) {
      return entry.kind
    }

    const series =
      entry.series.length > 0
        ? entry.series
        : byId.get(entry.spreadId)?.series || []

    if (series.length === 0) {
      return entry.kind
    }

    return series.some((title) =>
      coverSeries.has(title)
    )
      ? 'opening'
      : 'center'
  })
}

// 見開きと、それを1ページずつ撮った画像は、同じ作品にそろえる。
// ロゴが片方のページにしかないと、もう片方が「読み切り」や空になるため、
// 組の中で見つかった作品名を全員に付ける（作品名があれば「読み切り」より優先）。
// items: [{ id, spreadId, series }] → 各画像の series
export function unifySpreadSeries(items) {
  const groupOf = (item) => item.spreadId || item.id

  const titles = new Map()

  for (const item of items) {
    const key = groupOf(item)

    titles.set(key, [
      ...(titles.get(key) || []),
      ...item.series
    ])
  }

  const isPaired =
    new Set(
      items
        .filter((item) => item.spreadId)
        .map((item) => item.spreadId)
    )

  return items.map((item) => {
    const key = groupOf(item)

    if (!item.spreadId && !isPaired.has(item.id)) {
      return item.series
    }

    const all = Array.from(new Set(titles.get(key)))

    const named =
      all.filter((title) => !PINNED_TAGS.includes(title))

    return named.length > 0 ? named : all
  })
}
