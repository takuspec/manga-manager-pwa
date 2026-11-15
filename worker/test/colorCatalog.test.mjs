import test from 'node:test'
import assert from 'node:assert/strict'
import {
  arrangeSeriesGroups,
  describeSeriesPeriod,
  listCatalogSeriesEntries,
  mergeSeriesGroups,
  findAppMagazine,
  getCatalogRange,
  getCatalogStart,
  getCatalogYears,
  listCatalogIssues,
  listCatalogSeries,
  listSeriesInIssue
} from '../../src/utils/colorCatalog.js'

// アプリに登録されているジャンプの設定（号数の決まりと合併号）と同じ形
const jump = {
  id: 1,
  name: '週刊少年ジャンプ',
  frequency: 'weekly',
  releaseDay: 1,
  releaseDate: 1,
  baseDate: '2026-09-13',
  baseIssueYear: 2026,
  baseIssue: 41,
  weeklyIssueRules: { 2026: 52, 2027: 52 },
  weeklyMergedIssues: {
    2018: [[2, 3], [4, 5], [21, 22], [36, 37]],
    2019: [[4, 5], [6, 7], [22, 23], [36, 37]],
    2020: [[4, 5], [6, 7], [21, 22], [33, 34], [36, 37]],
    2021: [[3, 4], [5, 6], [21, 22], [33, 34], [36, 37]],
    2022: [[3, 4], [5, 6], [21, 22], [36, 37]],
    2023: [[4, 5], [6, 7], [21, 22], [36, 37]],
    2024: [[4, 5], [6, 7], [22, 23], [36, 37]],
    2025: [[4, 5], [6, 7], [22, 23], [36, 37]],
    2026: [[4, 5], [6, 7], [22, 23], [37, 38], [42, 43]]
  }
}

const sunday = {
  id: 2,
  name: '週刊少年サンデー',
  frequency: 'weekly'
}

const TODAY = new Date('2026-11-16T12:00:00+09:00')

const series = (title, fields) => ({
  title,
  magazineId: jump.id,
  status: 'ongoing',
  publicationPace: 'weekly',
  ...fields
})

const seriesList = [
  series('2018年40号で終了', {
    status: 'completed',
    startIssueYear: 2010,
    startIssue: 1,
    completedIssueYear: 2018,
    completedIssue: 40
  }),
  series('2018年41号で終了', {
    status: 'completed',
    startIssueYear: 2015,
    startIssue: 1,
    completedIssueYear: 2018,
    completedIssue: 41
  }),
  series('長期連載', {
    startIssueYear: 1997,
    startIssue: 34
  }),
  series('合併号で開始', {
    startIssueYear: 2026,
    startIssue: 42
  }),
  series('隔週連載', {
    startIssueYear: 2026,
    startIssue: 44,
    publicationPace: 'biweekly'
  }),
  series('休載中', {
    status: 'paused',
    startIssueYear: 2020,
    startIssue: 10
  }),
  // 同じ名前が二重に登録されていても1つにまとめる
  series('長期連載', {
    startIssueYear: 1997,
    startIssue: 34
  }),
  {
    title: 'ほかの雑誌の作品',
    magazineId: sunday.id,
    status: 'ongoing',
    startIssueYear: 2020,
    startIssue: 1
  },
  series('   ', {
    startIssueYear: 2020,
    startIssue: 1
  })
]

test('アプリ側の雑誌を名前で探す', () => {
  const list = [sunday, jump]

  assert.equal(
    findAppMagazine(
      { slug: 'jump', name: '週刊少年ジャンプ' },
      list
    ),
    jump
  )
  // 名前が違っても、同じ雑誌とわかれば見つける
  assert.equal(
    findAppMagazine(
      { slug: 'wj', name: 'ジャンプ' },
      list
    ),
    jump
  )
  assert.equal(
    findAppMagazine(
      { slug: 'harta', name: 'ハルタ' },
      list
    ),
    null
  )
})

test('号の一覧はジャンプだけ、2018年41号から', () => {
  assert.deepEqual(
    getCatalogStart({ slug: 'jump', name: 'ジャンプ' }),
    { year: 2018, issue: 41 }
  )
  assert.equal(
    getCatalogStart({ slug: 'sunday', name: 'サンデー' }),
    null
  )

  const range =
    getCatalogRange(
      { slug: 'jump', name: 'ジャンプ' },
      jump,
      TODAY
    )

  assert.deepEqual(range, {
    start: { year: 2018, issue: 41 },
    latest: { year: 2026, issue: 51 }
  })

  assert.deepEqual(getCatalogYears(range), [
    2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018
  ])

  // 2018年は41号から
  assert.deepEqual(
    listCatalogIssues(jump, 2018, range),
    ['41', '42', '43', '44', '45', '46', '47', '48', '49', '50', '51', '52']
  )

  // 2026年は最新号（51号）まで。合併号は1つにまとまる
  const issues2026 =
    listCatalogIssues(jump, 2026, range)

  assert.equal(issues2026.length, 46)
  assert.deepEqual(issues2026.slice(0, 6), [
    '01', '02', '03', '04-05', '06-07', '08'
  ])
  assert.ok(issues2026.includes('42-43'))
  assert.ok(!issues2026.includes('42'))
  assert.ok(!issues2026.includes('43'))
  assert.equal(issues2026.at(-1), '51')

  // 範囲外の年や、雑誌の設定がない場合は空
  assert.deepEqual(
    listCatalogIssues(jump, 2017, range),
    []
  )
  assert.equal(
    getCatalogRange(
      { slug: 'sunday', name: 'サンデー' },
      sunday,
      TODAY
    ),
    null
  )
})

test('作品の一覧: 2018年41号以降に連載していた作品', () => {
  const range =
    getCatalogRange(
      { slug: 'jump', name: 'ジャンプ' },
      jump,
      TODAY
    )

  assert.deepEqual(
    listCatalogSeries(seriesList, jump, range),
    [
      '2018年41号で終了',
      '休載中',
      '合併号で開始',
      '長期連載',
      '隔週連載'
    ].sort((a, b) => a.localeCompare(b, 'ja'))
  )
})

test('その号に載っていた作品', () => {
  assert.deepEqual(
    listSeriesInIssue(seriesList, jump, 2018, '41'),
    ['2018年41号で終了', '長期連載'].sort((a, b) =>
      a.localeCompare(b, 'ja')
    )
  )
  assert.deepEqual(
    listSeriesInIssue(seriesList, jump, 2018, '42'),
    ['長期連載']
  )

  // 合併号は、どちらかの号で始まっていれば載っている
  assert.ok(
    listSeriesInIssue(
      seriesList,
      jump,
      2026,
      '42-43'
    ).includes('合併号で開始')
  )
  assert.ok(
    !listSeriesInIssue(
      seriesList,
      jump,
      2026,
      '41'
    ).includes('合併号で開始')
  )

  // 隔週の作品は、載る号だけ
  assert.ok(
    listSeriesInIssue(seriesList, jump, 2026, '44').includes('隔週連載')
  )
  assert.ok(
    !listSeriesInIssue(seriesList, jump, 2026, '45').includes('隔週連載')
  )
  assert.ok(
    listSeriesInIssue(seriesList, jump, 2026, '46').includes('隔週連載')
  )

  assert.deepEqual(
    listSeriesInIssue(seriesList, jump, 2026, 'xx'),
    []
  )
  assert.deepEqual(
    listSeriesInIssue(seriesList, null, 2026, '50'),
    []
  )
})

test('連載期間の表示', () => {
  assert.equal(
    describeSeriesPeriod(
      seriesList[1],
      jump,
      TODAY
    ).startsWith('2015年'),
    true
  )
  assert.match(
    describeSeriesPeriod(seriesList[1], jump, TODAY),
    /〜2018年41号（3年\d+週）$/
  )
  assert.match(
    describeSeriesPeriod(seriesList[3], jump, TODAY),
    /^2026年42.*〜連載中（0年\d+週）$/
  )
  assert.match(
    describeSeriesPeriod(seriesList[5], jump, TODAY),
    /〜休載中/
  )
  assert.equal(
    describeSeriesPeriod({ title: 'x' }, jump, TODAY),
    '期間未設定'
  )
})

test('作品ごとの表示: 連載データを使い、絞り込みと並べ替えができる', () => {
  const range = {
    start: { year: 2018, issue: 41 },
    latest: { year: 2026, issue: 51 }
  }

  const entries =
    listCatalogSeriesEntries(
      seriesList,
      jump,
      range,
      TODAY
    )

  assert.deepEqual(
    entries.map((entry) => [entry.title, entry.status]),
    [
      ['2018年41号で終了', 'completed'],
      ['長期連載', 'ongoing'],
      ['合併号で開始', 'ongoing'],
      ['隔週連載', 'ongoing'],
      ['休載中', 'paused']
    ]
  )

  // 号の一覧がない雑誌は、その雑誌の作品すべて
  assert.equal(
    listCatalogSeriesEntries(seriesList, jump, null, TODAY)
      .length,
    6
  )

  const groups =
    mergeSeriesGroups(entries, [
      {
        title: '長期連載',
        count: 3,
        cover: { year: 2026, folder: '50', file: '01-cover.jpg' }
      },
      {
        title: 'アプリにない作品',
        count: 1,
        cover: { year: 2026, folder: '50', file: '02-opening.jpg' }
      }
    ])

  const titles = (list) => list.map((group) => group.title)

  assert.deepEqual(
    titles(arrangeSeriesGroups(groups, 'all', 'new')),
    [
      '隔週連載',
      '合併号で開始',
      '休載中',
      '2018年41号で終了',
      '長期連載',
      'アプリにない作品'
    ]
  )
  assert.deepEqual(
    titles(arrangeSeriesGroups(groups, 'all', 'old')),
    [
      '長期連載',
      '2018年41号で終了',
      '休載中',
      '合併号で開始',
      '隔週連載',
      'アプリにない作品'
    ]
  )
  assert.deepEqual(
    titles(arrangeSeriesGroups(groups, 'completed', 'new')),
    ['2018年41号で終了']
  )
  // 連載中には休載中も含む
  assert.deepEqual(
    titles(arrangeSeriesGroups(groups, 'ongoing', 'name')).sort(),
    ['休載中', '合併号で開始', '長期連載', '隔週連載'].sort()
  )
  assert.deepEqual(
    titles(arrangeSeriesGroups(groups, 'all', 'count')).slice(0, 2),
    ['長期連載', 'アプリにない作品']
  )

  const merged =
    groups.find((group) => group.title === '長期連載')

  assert.equal(merged.count, 3)
  assert.equal(merged.status, 'ongoing')
  assert.match(merged.period, /〜連載中/)
})
