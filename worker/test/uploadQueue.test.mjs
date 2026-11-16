import test from 'node:test'
import assert from 'node:assert/strict'
import { createUploadQueue } from '../../src/utils/uploadQueue.js'
import { CloudError } from '../../src/utils/cloudClient.js'

function memoryStorage() {
  const data = new Map()

  return {
    data,
    list: async () => Array.from(data.values()),
    put: async (batch) => {
      data.set(batch.id, structuredClone({
        ...batch,
        items: batch.items.map((item) => ({ ...item }))
      }))
    },
    remove: async (id) => {
      data.delete(id)
    }
  }
}

const item = (n, kind = 'center') => ({
  full: `full-${n}`,
  thumb: `thumb-${n}`,
  width: 1872,
  height: 2732,
  kind,
  series: []
})

let clock = 1000

test('登録したらすぐ戻り、裏で1件ずつ順番に送る', async () => {
  const storage = memoryStorage()
  const calls = []
  let release

  const firstBlocked =
    new Promise((resolve) => {
      release = resolve
    })

  const queue =
    createUploadQueue({
      storage,
      now: () => (clock += 1),
      upload: async ({ folder, prepared, onProgress }) => {
        calls.push(folder)

        if (folder === '50') {
          await firstBlocked
        }

        prepared.forEach((_, index) => onProgress(index + 1))

        return {
          added: prepared.map(() => ({})),
          failure: null
        }
      }
    })

  await queue.enqueue({
    slug: 'jump',
    year: 2026,
    folder: '50',
    items: [item(1), item(2)]
  })

  // 1件目の送信中でも、次の号を登録できる
  await queue.enqueue({
    slug: 'jump',
    year: 2026,
    folder: '49',
    items: [item(3)]
  })

  let snapshot = queue.getSnapshot()

  assert.deepEqual(
    snapshot.batches.map((batch) => [
      batch.folder,
      batch.status
    ]),
    [
      ['50', 'sending'],
      ['49', 'waiting']
    ]
  )
  assert.equal(storage.data.size, 2)

  release()
  await queue.idle()

  snapshot = queue.getSnapshot()

  assert.deepEqual(calls, ['50', '49'])
  assert.deepEqual(snapshot.batches, [])
  assert.deepEqual(snapshot.finished, {
    'jump/2026/50': 1,
    'jump/2026/49': 1
  })
  assert.equal(storage.data.size, 0)
})

test('途中で失敗したら残りだけを残し、再試行で続きから送る', async () => {
  const storage = memoryStorage()
  const sent = []
  let fail = true

  const queue =
    createUploadQueue({
      storage,
      now: () => (clock += 1),
      upload: async ({ prepared }) => {
        if (fail) {
          sent.push(prepared[0].full)

          return {
            added: [{}],
            failure: new CloudError('network', '通信できませんでした。')
          }
        }

        prepared.forEach((entry) => sent.push(entry.full))

        return {
          added: prepared.map(() => ({})),
          failure: null
        }
      }
    })

  await queue.enqueue({
    slug: 'jump',
    year: 2026,
    folder: '48',
    items: [item(1), item(2), item(3)]
  })
  await queue.idle()

  let snapshot = queue.getSnapshot()

  assert.equal(snapshot.batches.length, 1)
  assert.equal(snapshot.batches[0].status, 'error')
  assert.equal(snapshot.batches[0].count, 2)
  assert.equal(snapshot.batches[0].error, '通信できませんでした。')
  // 送れた1枚の分は、画面に反映させる
  assert.equal(snapshot.finished['jump/2026/48'], 1)

  fail = false
  queue.retryTemporary()
  await queue.idle()

  snapshot = queue.getSnapshot()

  assert.deepEqual(sent, ['full-1', 'full-2', 'full-3'])
  assert.deepEqual(snapshot.batches, [])
  assert.equal(storage.data.size, 0)
})

test('送り残しは次に開いたときに続きから送る', async () => {
  const storage = memoryStorage()

  await storage.put({
    id: 'old-2',
    slug: 'jump',
    year: 2026,
    folder: '47',
    items: [item(2)],
    createdAt: 2,
    status: 'sending',
    error: '',
    temporary: false
  })
  await storage.put({
    id: 'old-1',
    slug: 'jump',
    year: 2026,
    folder: '46',
    items: [item(1)],
    createdAt: 1,
    status: 'waiting',
    error: '',
    temporary: false
  })
  await storage.put({
    id: 'old-3',
    slug: 'jump',
    year: 2026,
    folder: '45',
    items: [item(3)],
    createdAt: 3,
    status: 'error',
    error: 'サーバーがエラーを返しました（400）。',
    temporary: false
  })

  const calls = []

  const queue =
    createUploadQueue({
      storage,
      upload: async ({ folder, prepared }) => {
        calls.push(folder)

        return {
          added: prepared.map(() => ({})),
          failure: null
        }
      }
    })

  await queue.start()
  await queue.start()
  await queue.idle()

  // 古い順に送る。直らない失敗は、自動では送り直さない
  assert.deepEqual(calls, ['46', '47'])
  assert.deepEqual(
    queue.getSnapshot().batches.map((batch) => [
      batch.folder,
      batch.status
    ]),
    [['45', 'error']]
  )

  await queue.discard('old-3')

  assert.deepEqual(queue.getSnapshot().batches, [])
  assert.equal(storage.data.size, 0)
})

test('端末内に保存できなくても送信は続ける', async () => {
  const queue =
    createUploadQueue({
      storage: {
        list: async () => {
          throw new Error('no storage')
        },
        put: async () => {
          throw new Error('no storage')
        },
        remove: async () => {
          throw new Error('no storage')
        }
      },
      upload: async ({ prepared }) => ({
        added: prepared.map(() => ({})),
        failure: null
      })
    })

  const originalError = console.error
  console.error = () => {}

  try {
    await queue.start()
    await queue.enqueue({
      slug: 'jump',
      year: 2026,
      folder: '44',
      items: [item(1)]
    })
    await queue.idle()

    assert.deepEqual(queue.getSnapshot().batches, [])
    assert.equal(
      queue.getSnapshot().finished['jump/2026/44'],
      1
    )
  } finally {
    console.error = originalError
  }
})
