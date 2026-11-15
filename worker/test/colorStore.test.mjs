// アプリ側（colorStore + cloudClient）と Worker を実際につないで確かめる。
// 通信の代わりに、Worker の処理を同じプロセス内で直接呼ぶ。
import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.js'
import { FakeBucket } from './fakeBucket.mjs'

const TOKEN = 'integration-test-token'
const ENDPOINT = 'https://w.example.workers.dev'

const bucket = new FakeBucket()

const env = {
  AUTH_TOKEN: TOKEN,
  ALLOWED_ORIGINS: 'https://takuspec.github.io',
  BUCKET: bucket
}

const requests = []

globalThis.fetch = async (url, init = {}) => {
  const headers = new Headers(init.headers)

  // ブラウザは送信時に本体の長さを自動で付ける
  if (init.body) {
    headers.set(
      'content-length',
      String(init.body.size)
    )
  }

  requests.push(
    `${init.method || 'GET'} ${String(url).slice(
      ENDPOINT.length
    )}`
  )

  return worker.fetch(
    new Request(url, {
      method: init.method,
      headers,
      body: init.body
    }),
    env
  )
}

const saved = new Map([
  [
    'cloud-config-v1',
    JSON.stringify({
      endpoint: ENDPOINT,
      token: TOKEN
    })
  ]
])

Object.defineProperty(
  globalThis,
  'localStorage',
  {
    configurable: true,
    value: {
      getItem: (key) =>
        saved.has(key) ? saved.get(key) : null,
      setItem: (key, value) => {
        saved.set(key, String(value))
      },
      removeItem: (key) => {
        saved.delete(key)
      }
    }
  }
)

// この環境には端末内キャッシュ（IndexedDB）がないので、その失敗ログは出さない
console.error = () => {}

const store =
  await import('../../src/utils/colorStore.js')
const library =
  await import('../../src/utils/colorLibrary.js')

const jpeg = (size) =>
  new Blob([new Uint8Array(size).fill(7)], {
    type: 'image/jpeg'
  })

const prepared = (count) =>
  Array.from({ length: count }, (_, i) => ({
    full: jpeg(1000 + i),
    thumb: jpeg(100 + i),
    width: 2048,
    height: 2732
  }))

test('何もない状態では空の一覧が返る', async () => {
  const { root, fromCache } =
    await store.loadRootIndex()

  assert.deepEqual(root.magazines, [])
  assert.equal(fromCache, false)

  const { index } =
    await store.loadYearIndex('jump', 2026)

  assert.deepEqual(index.issues, {})
})

test('雑誌を追加して画像を登録すると、決めた場所に保存される', async () => {
  await store.updateRootIndex((root) =>
    library.upsertMagazine(root, {
      slug: 'jump',
      name: '週刊少年ジャンプ'
    })
  )

  const progress = []

  const result =
    await store.uploadImages({
      slug: 'jump',
      year: 2026,
      folder: '50',
      kind: 'cover',
      prepared: prepared(1),
      onProgress: (done) => progress.push(done)
    })

  assert.equal(result.failure, null)
  assert.deepEqual(progress, [1])

  await store.uploadImages({
    slug: 'jump',
    year: 2026,
    folder: '50',
    kind: 'center',
    prepared: prepared(3)
  })

  assert.deepEqual(
    Array.from(bucket.objects.keys()).sort(),
    [
      '_thumbs/jump/2026/50/01-cover.jpg',
      '_thumbs/jump/2026/50/02-center.jpg',
      '_thumbs/jump/2026/50/03-center.jpg',
      '_thumbs/jump/2026/50/04-center.jpg',
      'index.json',
      'jump/2026/50/01-cover.jpg',
      'jump/2026/50/02-center.jpg',
      'jump/2026/50/03-center.jpg',
      'jump/2026/50/04-center.jpg',
      'jump/2026/index.json'
    ]
  )

  assert.equal(
    bucket.objects.get(
      'jump/2026/50/01-cover.jpg'
    ).contentType,
    'image/jpeg'
  )

  const { index } =
    await store.loadYearIndex('jump', 2026)

  assert.deepEqual(
    index.issues['50'].images.map((image) => [
      image.file,
      image.kind,
      image.width,
      image.bytes
    ]),
    [
      ['01-cover.jpg', 'cover', 2048, 1000],
      ['02-center.jpg', 'center', 2048, 1000],
      ['03-center.jpg', 'center', 2048, 1001],
      ['04-center.jpg', 'center', 2048, 1002]
    ]
  )

  const { root } = await store.loadRootIndex()

  assert.deepEqual(root.magazines, [
    {
      slug: 'jump',
      name: '週刊少年ジャンプ',
      crops: {},
      years: [2026]
    }
  ])
})

test('保存した画像を同じ内容で取り出せる', async () => {
  const blob =
    await store.getImageBlob(
      'jump/2026/50/03-center.jpg'
    )

  assert.equal(blob.size, 1001)
  assert.equal(blob.type, 'image/jpeg')
})

test('同じ画像を同時に頼んでも通信は1回', async () => {
  const before = requests.length

  const [a, b, c] =
    await Promise.all([
      store.getImageBlob(
        '_thumbs/jump/2026/50/01-cover.jpg'
      ),
      store.getImageBlob(
        '_thumbs/jump/2026/50/01-cover.jpg'
      ),
      store.getImageBlob(
        '_thumbs/jump/2026/50/01-cover.jpg'
      )
    ])

  assert.equal(a.size, 100)
  assert.equal(b, a)
  assert.equal(c, a)
  assert.equal(requests.length - before, 1)
})

test('並べ替えと削除がクラウドに反映される', async () => {
  let index =
    await store.updateYearIndex(
      'jump',
      2026,
      (current) =>
        library.moveImageInIssue(
          current,
          '50',
          '04-center.jpg',
          -2
        )
    )

  index =
    await store.updateYearIndex(
      'jump',
      2026,
      (current) =>
        library.removeImageFromIssue(
          current,
          '50',
          '02-center.jpg'
        )
    )

  await store.deleteImageFiles(
    'jump',
    2026,
    '50',
    '02-center.jpg'
  )

  assert.deepEqual(
    index.issues['50'].images.map(
      (image) => image.file
    ),
    [
      '01-cover.jpg',
      '04-center.jpg',
      '03-center.jpg'
    ]
  )
  assert.equal(
    bucket.objects.has(
      'jump/2026/50/02-center.jpg'
    ),
    false
  )
  assert.equal(
    bucket.objects.has(
      '_thumbs/jump/2026/50/02-center.jpg'
    ),
    false
  )

  // 次に追加しても、消した番号や既存の番号と重ならない
  await store.uploadImages({
    slug: 'jump',
    year: 2026,
    folder: '50',
    kind: 'spread',
    prepared: prepared(1)
  })

  assert.ok(
    bucket.objects.has(
      'jump/2026/50/05-spread.jpg'
    )
  )
})

test('別の端末が先に追加していても、互いの画像を消さない', async () => {
  // もう1台の端末が、こちらの知らないうちに同じ号へ追加した状態を作る
  const key = 'jump/2026/index.json'

  const remote =
    JSON.parse(
      new TextDecoder().decode(
        bucket.objects.get(key).bytes
      )
    )

  remote.issues['50'].images.push({
    file: '06-other.jpg',
    seq: 6,
    kind: 'other',
    width: 100,
    height: 100,
    bytes: 10,
    addedAt: '2026-11-16T00:00:00.000Z'
  })

  await bucket.put(key, JSON.stringify(remote))

  await store.uploadImages({
    slug: 'jump',
    year: 2026,
    folder: '50',
    kind: 'other',
    prepared: prepared(1)
  })

  const { index } =
    await store.loadYearIndex('jump', 2026)

  const files =
    index.issues['50'].images.map(
      (image) => image.file
    )

  assert.ok(files.includes('06-other.jpg'))
  assert.ok(files.includes('07-other.jpg'))
  assert.equal(new Set(files).size, files.length)
})

test('合併号と別の年も同じ決まりで保存される', async () => {
  await store.uploadImages({
    slug: 'jump',
    year: 2019,
    folder: '04-05',
    kind: 'cover',
    prepared: prepared(1)
  })

  assert.ok(
    bucket.objects.has(
      'jump/2019/04-05/01-cover.jpg'
    )
  )

  const { root } = await store.loadRootIndex()

  assert.deepEqual(
    root.magazines[0].years,
    [2026, 2019]
  )
})

test('送信の途中で失敗したら、送れた分だけ記録する', async () => {
  const realPut = bucket.put.bind(bucket)
  let attempts = 0

  // 2枚目だけ、再試行しても失敗し続ける状態にする
  bucket.put = async (key, body, options) => {
    if (key === 'jump/2026/51/02-center.jpg') {
      attempts += 1
      throw new Error('simulated failure')
    }

    return realPut(key, body, options)
  }

  try {
    const result =
      await store.uploadImages({
        slug: 'jump',
        year: 2026,
        folder: '51',
        kind: 'center',
        prepared: prepared(3)
      })

    assert.equal(result.added.length, 1)
    assert.ok(result.failure)
    // 再試行は合計3回で打ち切られている
    assert.equal(attempts, 3)

    const { index } =
      await store.loadYearIndex('jump', 2026)

    assert.deepEqual(
      index.issues['51'].images.map(
        (image) => image.file
      ),
      ['01-center.jpg']
    )
  } finally {
    bucket.put = realPut
  }
})

test('まとめて登録: 1枚ごとの種類と作品タグが記録される', async () => {
  const items = prepared(3)

  items[0].kind = 'cover'
  items[1].kind = 'spread'
  items[1].series = ['あかね噺']
  items[2].kind = 'center'
  items[2].series = ['あかね噺', 'ONE PIECE']

  const result =
    await store.uploadImages({
      slug: 'jump',
      year: 2026,
      folder: '48',
      prepared: items
    })

  assert.equal(result.failure, null)

  assert.deepEqual(
    result.index.issues['48'].images.map(
      (image) => [image.file, image.series]
    ),
    [
      ['01-cover.jpg', []],
      ['02-spread.jpg', ['あかね噺']],
      ['03-center.jpg', ['あかね噺', 'ONE PIECE']]
    ]
  )
  assert.ok(
    bucket.objects.has(
      'jump/2026/48/02-spread.jpg'
    )
  )
})

test('作品ごとの表示: 複数の年をまとめて読み、短時間は読み直さない', async () => {
  const first =
    await store.loadYearIndexes('jump', [2026, 2019])

  assert.equal(first.indexes.length, 2)
  assert.deepEqual(
    library
      .listSeriesImages(first.indexes, 'あかね噺')
      .map((image) => [
        image.year,
        image.folder,
        image.file
      ]),
    [
      [2026, '48', '02-spread.jpg'],
      [2026, '48', '03-center.jpg']
    ]
  )

  const before = requests.length

  await store.loadYearIndexes('jump', [2026, 2019])

  assert.equal(requests.length, before)

  // タグを書き換えた直後は、新しい内容が返る
  await store.updateYearIndex(
    'jump',
    2026,
    (current) =>
      library.setImageSeriesInIssue(
        current,
        '48',
        '01-cover.jpg',
        ['あかね噺']
      )
  )

  const second =
    await store.loadYearIndexes('jump', [2026, 2019])

  assert.equal(
    library.listSeriesImages(
      second.indexes,
      'あかね噺'
    ).length,
    3
  )
})
