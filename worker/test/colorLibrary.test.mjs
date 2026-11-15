import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addImagesToIssue,
  addYearToMagazine,
  buildFileName,
  compareIssueFolders,
  formatIssueFolder,
  imageKey,
  issueFolder,
  listIssues,
  moveImageInIssue,
  nextSequence,
  normalizeRootIndex,
  normalizeSlug,
  normalizeYearIndex,
  parseIssueLabel,
  removeImageFromIssue,
  setImageKindInIssue,
  thumbKey,
  upsertMagazine,
  yearIndexKey
} from '../../src/utils/colorLibrary.js'
import { parseKey } from '../src/index.js'

const NOW = '2026-11-16T00:00:00.000Z'

const image = (seq, kind = 'other') => ({
  file: buildFileName(seq, kind),
  seq,
  kind,
  width: 2048,
  height: 2732,
  bytes: 1000,
  addedAt: NOW
})

test('雑誌のフォルダ名', () => {
  assert.equal(normalizeSlug(' Jump '), 'jump')
  assert.equal(normalizeSlug('shonen-sunday'), 'shonen-sunday')
  assert.equal(normalizeSlug('ジャンプ'), '')
  assert.equal(normalizeSlug('-jump'), '')
  assert.equal(normalizeSlug('a/b'), '')
  assert.equal(normalizeSlug('_thumbs'), '')
  assert.equal(normalizeSlug('index'), '')
  assert.equal(normalizeSlug(''), '')
})

test('号の読み取りとフォルダ名', () => {
  assert.deepEqual(parseIssueLabel('50'), {
    start: 50,
    end: null
  })
  assert.deepEqual(parseIssueLabel(' ５０号 '), {
    start: 50,
    end: null
  })
  assert.deepEqual(parseIssueLabel('4・5'), {
    start: 4,
    end: 5
  })
  assert.deepEqual(parseIssueLabel('36-37'), {
    start: 36,
    end: 37
  })
  assert.equal(parseIssueLabel('0'), null)
  assert.equal(parseIssueLabel('5-4'), null)
  assert.equal(parseIssueLabel('abc'), null)
  assert.equal(parseIssueLabel('123'), null)
  assert.equal(parseIssueLabel(''), null)

  assert.equal(
    issueFolder(parseIssueLabel('7')),
    '07'
  )
  assert.equal(
    issueFolder(parseIssueLabel('4・5')),
    '04-05'
  )
  assert.equal(formatIssueFolder('07'), '7号')
  assert.equal(
    formatIssueFolder('04-05'),
    '4・5合併号'
  )

  assert.deepEqual(
    ['50', '04-05', '10', '02'].sort(
      compareIssueFolders
    ),
    ['02', '04-05', '10', '50']
  )
})

test('保存先の名前は Worker が受け付ける形になる', () => {
  const key =
    imageKey(
      'jump',
      2026,
      '04-05',
      buildFileName(1, 'cover')
    )

  assert.equal(key, 'jump/2026/04-05/01-cover.jpg')
  assert.ok(parseKey(key))
  assert.ok(
    parseKey(
      thumbKey('jump', 2026, '50', '03-center.jpg')
    )
  )
  assert.ok(parseKey(yearIndexKey('jump', 2026)))
  assert.ok(parseKey('index.json'))
  assert.equal(
    buildFileName(12, 'unknown'),
    '12-other.jpg'
  )
})

test('雑誌の一覧: 追加・改名・年の追加', () => {
  let root = normalizeRootIndex(null)

  root =
    upsertMagazine(root, {
      slug: 'jump',
      name: '週刊少年ジャンプ'
    })
  root =
    upsertMagazine(root, {
      slug: 'bad slug',
      name: 'x'
    })
  root = addYearToMagazine(root, 'jump', 2025)
  root = addYearToMagazine(root, 'jump', 2026)
  root = addYearToMagazine(root, 'jump', 2026)
  root = addYearToMagazine(root, 'jump', 99999)
  root = addYearToMagazine(root, 'none', 2026)
  root =
    upsertMagazine(root, {
      slug: 'jump',
      name: 'ジャンプ'
    })

  assert.deepEqual(root, {
    version: 1,
    magazines: [
      {
        slug: 'jump',
        name: 'ジャンプ',
        years: [2026, 2025]
      }
    ]
  })
})

test('年の索引: 追加・並べ替え・種類変更・削除', () => {
  let index =
    normalizeYearIndex(null, 'jump', 2026)

  index =
    addImagesToIssue(
      index,
      '50',
      [image(1, 'cover'), image(2, 'spread')],
      NOW
    )

  // 同じファイル名は二重に登録しない
  index =
    addImagesToIssue(
      index,
      '50',
      [image(2, 'spread'), image(3, 'center')],
      NOW
    )

  assert.deepEqual(
    index.issues['50'].images.map((i) => i.file),
    [
      '01-cover.jpg',
      '02-spread.jpg',
      '03-center.jpg'
    ]
  )
  assert.equal(
    nextSequence(index.issues['50'].images),
    4
  )

  index =
    moveImageInIssue(
      index,
      '50',
      '03-center.jpg',
      -1,
      NOW
    )
  // 端より先には動かない
  index =
    moveImageInIssue(
      index,
      '50',
      '01-cover.jpg',
      -1,
      NOW
    )

  assert.deepEqual(
    index.issues['50'].images.map((i) => i.file),
    [
      '01-cover.jpg',
      '03-center.jpg',
      '02-spread.jpg'
    ]
  )

  index =
    setImageKindInIssue(
      index,
      '50',
      '02-spread.jpg',
      'center',
      NOW
    )

  assert.equal(
    index.issues['50'].images[2].kind,
    'center'
  )

  index =
    removeImageFromIssue(
      index,
      '50',
      '03-center.jpg',
      NOW
    )

  // 消した番号は使い回さない
  assert.equal(
    nextSequence(index.issues['50'].images),
    3
  )

  index =
    removeImageFromIssue(
      index,
      '50',
      '01-cover.jpg',
      NOW
    )
  index =
    removeImageFromIssue(
      index,
      '50',
      '02-spread.jpg',
      NOW
    )

  // 画像がなくなった号は一覧から消える
  assert.deepEqual(index.issues, {})
})

test('号は番号順に並ぶ。壊れた索引は安全に読み飛ばす', () => {
  let index =
    normalizeYearIndex(
      {
        issues: {
          '50': { images: [image(1, 'cover')] },
          '../x': { images: [image(1)] },
          '07': {
            images: [
              image(1),
              { file: '../../evil.jpg' },
              image(1)
            ]
          },
          '10': { images: [] }
        }
      },
      'jump',
      2026
    )

  index =
    addImagesToIssue(index, '04-05', [image(1)], NOW)

  assert.deepEqual(
    listIssues(index).map((issue) => [
      issue.folder,
      issue.images.length
    ]),
    [
      ['04-05', 1],
      ['07', 1],
      ['50', 1]
    ]
  )
})
