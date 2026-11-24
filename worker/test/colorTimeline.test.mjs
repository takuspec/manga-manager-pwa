import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTimeline,
  listTimelineYears
} from '../../src/utils/colorTimeline.js'

test('年表の年: 連載期間と画像のある年を合わせる', () => {
  assert.deepEqual(
    listTimelineYears(
      { startIssueYear: 2021, status: 'completed', completedIssueYear: 2023 },
      [{ year: 2020 }],
      2026
    ),
    [2020, 2021, 2022, 2023]
  )

  assert.deepEqual(
    listTimelineYears(null, [{ year: 2024 }, { year: 2022 }], 2026),
    [2022, 2024]
  )
})

test('年表のマス: 画像の種類、開始・完結の印、まとめの回数', () => {
  const images = [
    { year: 2021, folder: '15', kind: 'cover', file: 'a.jpg' },
    { year: 2021, folder: '15', kind: 'opening', file: 'b.jpg' },
    { year: 2021, folder: '20', kind: 'center', file: 'c.jpg' },
    { year: 2022, folder: '01', kind: 'center', file: 'd.jpg' }
  ]

  const { cells, summary } =
    buildTimeline({
      appMagazine: null,
      seriesList: [],
      series: { startIssueYear: 2021, startIssue: 15, status: 'completed', completedIssueYear: 2021, completedIssue: 20 },
      title: 'X',
      year: 2021,
      images
    })

  assert.deepEqual(
    cells.map((cell) => [cell.label, cell.cover, cell.opening, cell.center, cell.start, cell.end]),
    [
      ['15', true, true, false, true, false],
      ['20', false, false, true, false, true]
    ]
  )
  assert.deepEqual(summary, {
    cover: 1,
    opening: 1,
    center: 1,
    colorIssues: 2,
    published: 2
  })
})
