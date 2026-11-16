import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CROP_PRESETS,
  findCropPreset,
  normalizeCrop,
  pickCropBox,
  setMagazineCrops,
  addImagesToIssue,
  addYearToMagazine,
  buildFileName,
  collectSeries,
  compareIssueFolders,
  formatIssueFolder,
  imageKey,
  issueFolder,
  listIssues,
  listSeriesImages,
  moveImageInIssue,
  nextSequence,
  normalizeRootIndex,
  normalizeSlug,
  normalizeYearIndex,
  parseIssueLabel,
  removeImageFromIssue,
  setImageKindInIssue,
  setImageSeriesInIssue,
  suggestKinds,
  getImageLabel,
  groupColorPieces,
  arrangeSeriesImages,
  hideSpreadPages,
  setSpreadPagesInIssue,
  matchSpreadPages,
  signatureDistance,
  normalizeKind,
  thumbKey,
  upsertMagazine,
  yearIndexKey
} from '../../src/utils/colorLibrary.js'
import { parseKey } from '../src/index.js'

const NOW = '2026-11-16T00:00:00.000Z'

// ファイル名は種類名そのまま（以前の「spread」も含めて）で作る
const image = (seq, kind = 'other') => ({
  file: `${String(seq).padStart(2, '0')}-${kind}.jpg`,
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
        crops: {},
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

// テスト用の署名。同じ「絵」の番号なら同じ明るさの並びになる。
const art = (n) =>
  Array.from({ length: 216 }, (_, i) => ((i * 37 + n * 101) % 256))

const shifted = (n, amount) =>
  art(n).map((value) => Math.min(255, value + amount))

const page = (id, n) => ({
  id,
  width: 1872,
  height: 2732,
  signature: n === null ? null : { page: art(n) }
})

const spread = (id, left, right) => ({
  id,
  width: 2732,
  height: 1994,
  signature: { left: art(left), right: art(right) }
})

// matchSpreadPages の結果を各画像に付ける
const withPages = (items) => {
  const pages = matchSpreadPages(items)

  return items.map((item) => ({
    ...item,
    spreadId: pages.get(item.id) || null
  }))
}

test('見開きのページを、画像の中身で見分ける', () => {
  assert.equal(signatureDistance(art(1), art(1)), 0)
  assert.ok(signatureDistance(art(1), shifted(1, 10)) <= 10)
  assert.ok(signatureDistance(art(1), art(2)) > 22)
  assert.equal(signatureDistance(art(1), null), Infinity)

  const pages =
    matchSpreadPages([
      spread('s1', 10, 11),
      page('p1', 11),
      { ...page('p2', 10), signature: { page: shifted(10, 8) } },
      page('p3', 12),
      page('p4', 10),
      page('p5', null)
    ])

  // 1つの見開きにつくのは、よく似た2枚まで
  assert.deepEqual(
    Object.fromEntries(pages),
    { p1: 's1', p4: 's1' }
  )
})

test('種類の初期値: 巻頭カラーは扉の有無や各ページの有無に合わせる', () => {
  // 扉あり・各ページあり: 表紙、扉、見開き、各ページ2枚、センターカラー3枚
  assert.deepEqual(
    suggestKinds(
      withPages([
        page('cover', 1),
        page('title', 2),
        spread('s', 3, 4),
        page('r', 3),
        page('l', 4),
        page('c1', 5),
        page('c2', 6),
        page('c3', 7)
      ])
    ),
    [
      'cover',
      'opening',
      'opening',
      'opening',
      'opening',
      'center',
      'center',
      'center'
    ]
  )

  // 扉なし（見開きだけ）・各ページあり
  assert.deepEqual(
    suggestKinds(
      withPages([
        page('cover', 1),
        spread('s', 3, 4),
        page('r', 3),
        page('l', 4),
        page('c1', 5)
      ])
    ),
    ['cover', 'opening', 'opening', 'opening', 'center']
  )

  // 各ページを撮っていない回は、見開きのあとの縦をセンターカラーにする
  assert.deepEqual(
    suggestKinds(
      withPages([
        page('cover', 1),
        page('title', 2),
        spread('s', 3, 4),
        page('c1', 5),
        page('c2', 6)
      ])
    ),
    ['cover', 'opening', 'opening', 'center', 'center']
  )

  // センターカラーの見開きと各ページはセンターカラー
  assert.deepEqual(
    suggestKinds(
      withPages([
        page('cover', 1),
        spread('s', 3, 4),
        spread('cs', 8, 9),
        page('cr', 8),
        page('cl', 9)
      ])
    ),
    ['cover', 'opening', 'center', 'center', 'center']
  )

  // 表紙と巻頭カラーがすでにある号に足すときは、すべてセンターカラー
  assert.deepEqual(
    suggestKinds(withPages([page('a', 1), spread('s', 3, 4)]), {
      hasCover: true,
      hasOpening: true
    }),
    ['center', 'center']
  )

  // 見開きがなければ巻頭カラーは決めない
  assert.deepEqual(
    suggestKinds(withPages([page('a', 1), page('b', 2)])),
    ['cover', 'center']
  )
})

test('同じ作品としてまとまる画像の組', () => {
  const items =
    withPages([
      page('cover', 1),
      page('title', 2),
      spread('s', 3, 4),
      page('r', 3),
      page('l', 4),
      page('c1', 5),
      spread('cs', 8, 9),
      page('cr', 8),
      page('cl', 9),
      page('c3', 7)
    ])

  const kinds = suggestKinds(items)

  assert.deepEqual(
    groupColorPieces(
      items.map((item, index) => ({
        ...item,
        kind: kinds[index]
      }))
    ),
    [0, 1, 1, 1, 1, 2, 3, 3, 3, 4]
  )

  // 並べ替えても、見開きとそのページは同じ組のまま
  assert.deepEqual(
    groupColorPieces([
      { ...items[7], kind: 'center' },
      { ...items[0], kind: 'cover' },
      { ...items[6], kind: 'center' }
    ]),
    [0, 1, 0]
  )

  // 以前の「見開き」も巻頭カラーとして続きを判定する
  assert.deepEqual(
    groupColorPieces([
      { id: 'a', width: 2732, height: 1994, kind: 'spread' },
      { id: 'b', width: 1872, height: 2732, kind: 'opening' }
    ]),
    [0, 0]
  )
})

test('種類の名前と、以前の「見開き」の扱い', () => {
  assert.equal(normalizeKind('spread'), 'opening')
  assert.equal(normalizeKind('opening'), 'opening')
  assert.equal(normalizeKind('xxx'), 'other')

  assert.equal(
    getImageLabel({
      kind: 'opening',
      width: 2732,
      height: 1994
    }),
    '巻頭カラー・見開き'
  )
  assert.equal(
    getImageLabel({
      kind: 'center',
      width: 1872,
      height: 2732
    }),
    'センターカラー・縦'
  )
  assert.equal(
    getImageLabel({ kind: 'spread' }),
    '巻頭カラー'
  )

  // 以前「見開き」で登録した画像は、ファイル名を変えずに巻頭カラーになる
  const index =
    normalizeYearIndex(
      {
        issues: {
          '50': { images: [image(2, 'spread')] }
        }
      },
      'jump',
      2026
    )

  assert.equal(
    index.issues['50'].images[0].file,
    '02-spread.jpg'
  )
  assert.equal(
    index.issues['50'].images[0].kind,
    'opening'
  )
})

test('作品タグ: 付け外しと、作品ごとの集計', () => {
  let y2026 =
    normalizeYearIndex(null, 'jump', 2026)
  let y2025 =
    normalizeYearIndex(null, 'jump', 2025)

  y2026 =
    addImagesToIssue(
      y2026,
      '50',
      [
        {
          ...image(1, 'cover'),
          series: [
            'あかね噺',
            ' ONE PIECE ',
            'あかね噺',
            ''
          ]
        },
        image(2, 'spread')
      ],
      NOW
    )
  y2026 =
    addImagesToIssue(
      y2026,
      '07',
      [{ ...image(1, 'center'), series: ['あかね噺'] }],
      NOW
    )
  y2025 =
    addImagesToIssue(
      y2025,
      '30',
      [{ ...image(1, 'spread'), series: ['あかね噺'] }],
      NOW
    )

  // 空白や重複は整理される。タグのない画像は空の一覧になる。
  assert.deepEqual(
    y2026.issues['50'].images.map((i) => i.series),
    [['あかね噺', 'ONE PIECE'], []]
  )

  y2026 =
    setImageSeriesInIssue(
      y2026,
      '50',
      '02-spread.jpg',
      ['あかね噺'],
      NOW
    )

  assert.deepEqual(
    collectSeries([y2025, y2026]),
    [
      {
        title: 'あかね噺',
        count: 4,
        cover: {
          year: 2026,
          folder: '50',
          file: '01-cover.jpg'
        }
      },
      {
        title: 'ONE PIECE',
        count: 1,
        cover: {
          year: 2026,
          folder: '50',
          file: '01-cover.jpg'
        }
      }
    ].sort((a, b) =>
      a.title.localeCompare(b.title, 'ja')
    )
  )

  // 新しい号から順に並ぶ
  assert.deepEqual(
    listSeriesImages([y2025, y2026], 'あかね噺').map(
      (i) => [i.year, i.folder, i.file]
    ),
    [
      [2026, '50', '01-cover.jpg'],
      [2026, '50', '02-spread.jpg'],
      [2026, '07', '01-center.jpg'],
      [2025, '30', '01-spread.jpg']
    ]
  )

  y2026 =
    setImageSeriesInIssue(
      y2026,
      '50',
      '01-cover.jpg',
      [],
      NOW
    )

  assert.deepEqual(
    collectSeries([y2026]).map((s) => [
      s.title,
      s.count
    ]),
    [['あかね噺', 2]]
  )
})

test('切り落としの固定値: 雑誌と縦横で決まった範囲になる', () => {
  const byId = (id) =>
    CROP_PRESETS.find((preset) => preset.id === id)
      .crops

  // 実際のスクリーンショットから測った範囲と一致する
  assert.deepEqual(
    pickCropBox(byId('jump'), 2048, 2732),
    { x: 88, y: 0, width: 1872, height: 2732 }
  )
  assert.deepEqual(
    pickCropBox(byId('jump'), 2732, 2048),
    { x: 0, y: 27, width: 2732, height: 1994 }
  )
  assert.deepEqual(
    pickCropBox(byId('magazine'), 2048, 2732),
    { x: 112, y: 64, width: 1824, height: 2618 }
  )
  assert.deepEqual(
    pickCropBox(byId('magazine'), 2732, 2048),
    { x: 18, y: 64, width: 2696, height: 1934 }
  )
  assert.deepEqual(
    pickCropBox(byId('sunday'), 2048, 2732),
    { x: 73, y: 0, width: 1902, height: 2732 }
  )
  assert.deepEqual(
    pickCropBox(byId('sunday'), 2732, 2048),
    { x: 0, y: 43, width: 2732, height: 1962 }
  )

  // 同じ縦横比で解像度だけ違う画像は、同じ割合で切る
  assert.deepEqual(
    pickCropBox(byId('jump'), 1024, 1366),
    { x: 44, y: 0, width: 936, height: 1366 }
  )

  // 縦横比が違う画像（別の端末など）には使わない
  assert.equal(
    pickCropBox(byId('jump'), 1179, 2556),
    null
  )
  assert.equal(pickCropBox({}, 2048, 2732), null)
  assert.equal(pickCropBox(null, 2048, 2732), null)
})

test('切り落としの固定値: 検査と保存', () => {
  assert.equal(normalizeCrop(null), null)
  assert.equal(
    normalizeCrop({
      width: 2048,
      height: 2732,
      top: -1,
      right: 0,
      bottom: 0,
      left: 0
    }),
    null
  )
  // 半分以上を切る値は受け付けない
  assert.equal(
    normalizeCrop({
      width: 2048,
      height: 2732,
      top: 0,
      right: 600,
      bottom: 0,
      left: 600
    }),
    null
  )

  assert.equal(
    findCropPreset('週刊少年ジャンプ', 'wj').id,
    'jump'
  )
  assert.equal(
    findCropPreset('週刊少年サンデー', 'ws').id,
    'sunday'
  )
  assert.equal(
    findCropPreset('週刊誌', 'magazine').id,
    'magazine'
  )
  assert.equal(findCropPreset('ハルタ', 'harta'), null)

  let root =
    upsertMagazine(normalizeRootIndex(null), {
      slug: 'jump',
      name: '週刊少年ジャンプ'
    })

  root =
    setMagazineCrops(root, 'jump', {
      ...CROP_PRESETS[0].crops,
      landscape: { width: 'x' }
    })

  // 使える方だけ保存され、読み直しても保たれる
  assert.deepEqual(
    normalizeRootIndex(
      JSON.parse(JSON.stringify(root))
    ).magazines[0].crops,
    {
      portrait: CROP_PRESETS[0].crops.portrait
    }
  )

  root = setMagazineCrops(root, 'jump', {})
  assert.deepEqual(root.magazines[0].crops, {})
})

test('作品ごとの画像の並べ順と種類の絞り込み', () => {
  // listSeriesImages と同じく新しい号から順
  const images = [
    { year: 2026, folder: '50', file: 'a', kind: 'center' },
    { year: 2026, folder: '50', file: 'b', kind: 'center' },
    { year: 2026, folder: '04-05', file: 'c', kind: 'opening' },
    { year: 2025, folder: '30', file: 'd', kind: 'spread' },
    { year: 2025, folder: '10', file: 'e', kind: 'cover' }
  ]

  const files = (list) => list.map((image) => image.file)

  assert.deepEqual(
    files(arrangeSeriesImages(images, 'new')),
    ['a', 'b', 'c', 'd', 'e']
  )
  // 古い順でも、同じ号の中の順は変えない
  assert.deepEqual(
    files(arrangeSeriesImages(images, 'old')),
    ['e', 'd', 'c', 'a', 'b']
  )
  // 以前の「見開き」も巻頭カラーとして絞り込む
  assert.deepEqual(
    files(arrangeSeriesImages(images, 'old', 'opening')),
    ['d', 'c']
  )
  assert.deepEqual(
    files(arrangeSeriesImages(images, 'new', 'center')),
    ['a', 'b']
  )
  assert.deepEqual(
    files(arrangeSeriesImages(images, 'new', 'cover')),
    ['e']
  )
  assert.deepEqual(
    files(arrangeSeriesImages(images, 'xxx', 'xxx')),
    ['a', 'b', 'c', 'd', 'e']
  )
})

test('見開きの各ページは一覧で見開きにまとめる', () => {
  let index =
    normalizeYearIndex(
      {
        issues: {
          '50': {
            images: [
              image(1, 'cover'),
              image(2, 'opening'),
              { ...image(3, 'opening'), pageOf: '02-opening.jpg' },
              { ...image(4, 'opening'), pageOf: '02-opening.jpg' },
              { ...image(5, 'center'), pageOf: '../x.jpg' },
              { ...image(6, 'center'), pageOf: '06-center.jpg' }
            ]
          }
        }
      },
      'jump',
      2026
    )

  const files = (list) => list.map((item) => item.file)

  // 壊れた対応（自分自身や不正な名前）は無視する
  assert.deepEqual(
    index.issues['50'].images.map((item) => item.pageOf),
    ['', '', '02-opening.jpg', '02-opening.jpg', '', '']
  )

  assert.deepEqual(
    files(hideSpreadPages(index.issues['50'].images)),
    ['01-cover.jpg', '02-opening.jpg', '05-center.jpg', '06-center.jpg']
  )

  // 見開きを消すと、ページは一覧に出る
  index =
    removeImageFromIssue(index, '50', '02-opening.jpg', NOW)

  assert.deepEqual(
    files(hideSpreadPages(index.issues['50'].images)),
    ['01-cover.jpg', '03-opening.jpg', '04-opening.jpg', '05-center.jpg', '06-center.jpg']
  )

  // 号をまたいだ一覧（作品ごと）でも、同じ号の見開きにだけまとめる
  assert.deepEqual(
    files(
      hideSpreadPages([
        { year: 2026, folder: '50', file: 's.jpg' },
        { year: 2026, folder: '50', file: 'p.jpg', pageOf: 's.jpg' },
        { year: 2026, folder: '49', file: 'q.jpg', pageOf: 's.jpg' }
      ])
    ),
    ['s.jpg', 'q.jpg']
  )

  // あとから対応を付け直す
  index =
    setSpreadPagesInIssue(
      index,
      '50',
      new Map([['06-center.jpg', '05-center.jpg']]),
      NOW
    )

  assert.deepEqual(
    index.issues['50'].images.map((item) => item.pageOf),
    ['', '', '', '', '05-center.jpg']
  )
})
