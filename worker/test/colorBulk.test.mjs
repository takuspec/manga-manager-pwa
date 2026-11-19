import test from 'node:test'
import assert from 'node:assert/strict'
import {
  groupByStarts,
  nextIssues,
  splitStarts
} from '../../src/utils/colorBulk.js'

test('表紙ごとに号を区切る（先頭はいつも始まり）', () => {
  const starts =
    splitStarts([
      { type: 'color' },
      { type: 'color' },
      { type: 'cover' },
      { type: 'toc' },
      { type: 'color' },
      { type: 'cover' }
    ])

  assert.deepEqual(starts, [true, false, true, false, false, true])
  assert.deepEqual(groupByStarts(starts), [[0, 1], [2, 3, 4], [5]])
})

test('号の一覧から、古い号へ・新しい号へ順に振る', () => {
  const sequence = [
    { year: 2020, folder: '52' },
    { year: 2021, folder: '01' },
    { year: 2021, folder: '02-03' },
    { year: 2021, folder: '04' }
  ]

  assert.deepEqual(
    nextIssues(sequence, { year: 2021, folder: '02-03' }, -1, 3),
    [
      { year: 2021, folder: '02-03' },
      { year: 2021, folder: '01' },
      { year: 2020, folder: '52' }
    ]
  )

  assert.deepEqual(
    nextIssues(sequence, { year: 2021, folder: '04' }, 1, 2),
    [{ year: 2021, folder: '04' }, null]
  )
})

test('号の一覧がない雑誌は、号数を1つずつ動かす', () => {
  assert.deepEqual(
    nextIssues([], { year: 2021, folder: '02' }, -1, 3),
    [
      { year: 2021, folder: '02' },
      { year: 2021, folder: '01' },
      { year: 2020, folder: '52' }
    ]
  )
})

test('撮った順: 写真の名前の番号順、だめなら更新日時の順', async () => {
  const { sortByShotOrder } = await import('../../src/utils/colorBulk.js')
  const file = (name, lastModified) => ({ name, lastModified })

  assert.deepEqual(
    sortByShotOrder([
      file('IMG_1002.PNG', 1),
      file('IMG_999.PNG', 2),
      file('IMG_1001.PNG', 3)
    ]).map((item) => item.name),
    ['IMG_999.PNG', 'IMG_1001.PNG', 'IMG_1002.PNG']
  )

  assert.deepEqual(
    sortByShotOrder([
      file('image.png', 30),
      file('image.png', 10),
      file('image.png', 20)
    ]).map((item) => item.lastModified),
    [10, 20, 30]
  )

  assert.deepEqual(
    sortByShotOrder([
      file('image.png', 5),
      file('image.png', 5)
    ]).map((item) => item.lastModified),
    [5, 5]
  )
})

test('種類: 表紙の作品は巻頭カラー、ほかはセンターカラー', async () => {
  const { refineKindsBySeries } = await import('../../src/utils/colorBulk.js')

  assert.deepEqual(
    refineKindsBySeries([
      { id: 'a', kind: 'cover', series: ['ONE PIECE'] },
      { id: 'b', kind: 'opening', series: ['ONE PIECE'] },
      { id: 'c', kind: 'opening', series: ['呪術廻戦'] },
      { id: 'd', kind: 'center', series: [], spreadId: 'c' },
      { id: 'e', kind: 'center', series: ['ONE PIECE'] },
      { id: 'f', kind: 'center', series: [] }
    ]),
    ['cover', 'opening', 'center', 'center', 'opening', 'center']
  )

  assert.deepEqual(
    refineKindsBySeries([
      { id: 'a', kind: 'cover', series: [] },
      { id: 'b', kind: 'opening', series: ['X'] }
    ]),
    ['cover', 'opening']
  )
})

test('見開きの組: ロゴがない側のページも同じ作品にそろえる', async () => {
  const { unifySpreadSeries } = await import('../../src/utils/colorBulk.js')

  assert.deepEqual(
    unifySpreadSeries([
      { id: 's', series: ['呪術廻戦'] },
      { id: 'l', spreadId: 's', series: ['呪術廻戦'] },
      { id: 'r', spreadId: 's', series: ['読み切り'] },
      { id: 'x', series: ['読み切り'] }
    ]),
    [['呪術廻戦'], ['呪術廻戦'], ['呪術廻戦'], ['読み切り']]
  )

  assert.deepEqual(
    unifySpreadSeries([
      { id: 's', series: [] },
      { id: 'l', spreadId: 's', series: ['ONE PIECE'] },
      { id: 'r', spreadId: 's', series: [] }
    ]),
    [['ONE PIECE'], ['ONE PIECE'], ['ONE PIECE']]
  )
})
