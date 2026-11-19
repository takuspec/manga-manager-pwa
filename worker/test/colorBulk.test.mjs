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
