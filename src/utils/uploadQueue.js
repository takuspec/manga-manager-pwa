// 画像の送信を裏で順番に行うための待ち行列。
//
// 登録ボタンを押したら、画像をこの行列に入れてすぐに次の登録へ進める。
// 行列は端末内（IndexedDB）にも保存するので、送信の途中でアプリを閉じても、
// 次に開いたときに続きから送る。送るのは1件ずつ（通信回数の安全装置はそのまま効く）。

import { uploadImages } from './colorStore.js'
import { CloudError } from './cloudClient.js'

const DB_NAME = 'manga-upload-queue'
const DB_VERSION = 1
const STORE = 'batches'

// ---- 端末内の保存先（IndexedDB）。使えない環境では保存しない ----
function createIndexedDbStorage() {
  let dbPromise = null

  const open = () => {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(
        new Error('IndexedDB is not available')
      )
    }

    if (!dbPromise) {
      dbPromise = new Promise(
        (resolve, reject) => {
          const request =
            indexedDB.open(DB_NAME, DB_VERSION)

          request.onupgradeneeded = () => {
            const db = request.result

            if (
              !db.objectStoreNames.contains(STORE)
            ) {
              db.createObjectStore(STORE, {
                keyPath: 'id'
              })
            }
          }

          request.onsuccess = () =>
            resolve(request.result)
          request.onerror = () => {
            dbPromise = null
            reject(request.error)
          }
        }
      )
    }

    return dbPromise
  }

  const run = async (mode, action) => {
    const db = await open()

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = action(tx.objectStore(STORE))

      tx.oncomplete = () =>
        resolve(request?.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }

  return {
    list: () =>
      run('readonly', (store) => store.getAll()),
    put: (batch) =>
      run('readwrite', (store) => store.put(batch)),
    remove: (id) =>
      run('readwrite', (store) => store.delete(id))
  }
}

function errorMessage(error) {
  return (
    error?.message ||
    '送信できませんでした。'
  )
}

// 電波や一時停止など、時間をおけば送れそうな失敗か
function isTemporary(error) {
  return (
    error instanceof CloudError &&
    [
      'network',
      'timeout',
      'paused',
      'too_many_requests'
    ].includes(error.code)
  )
}

export function createUploadQueue({
  upload = uploadImages,
  storage = createIndexedDbStorage(),
  now = () => Date.now()
} = {}) {
  let batches = []
  let running = false
  let current = null
  let started = false
  let snapshot = null

  // 送り終えた号ごとの回数。画面はこれが増えたら一覧を読み直す
  const finished = {}

  const listeners = new Set()

  const safely = async (action) => {
    try {
      await action()
    } catch (error) {
      console.error(error)
    }
  }

  const buildSnapshot = () => ({
    batches: batches.map((batch) => ({
      id: batch.id,
      slug: batch.slug,
      year: batch.year,
      folder: batch.folder,
      count: batch.items.length,
      status: batch.status,
      error: batch.error
    })),
    current: current ? { ...current } : null,
    finished: { ...finished }
  })

  const emit = () => {
    snapshot = buildSnapshot()
    listeners.forEach((listener) => listener())
  }

  const run = async () => {
    if (running) {
      return
    }

    running = true

    try {
      for (;;) {
        const batch =
          batches.find(
            (item) => item.status === 'waiting'
          )

        if (!batch) {
          break
        }

        batch.status = 'sending'
        batch.error = ''
        current = {
          id: batch.id,
          done: 0,
          total: batch.items.length
        }
        emit()

        let failure = null
        let sent = 0

        try {
          const result =
            await upload({
              slug: batch.slug,
              year: batch.year,
              folder: batch.folder,
              prepared: batch.items,
              onProgress: (done) => {
                current = {
                  ...current,
                  done
                }
                emit()
              }
            })

          sent = result.added.length
          failure = result.failure
        } catch (error) {
          failure = error
        }

        if (!failure) {
          batches =
            batches.filter(
              (item) => item.id !== batch.id
            )

          const key =
            `${batch.slug}/${batch.year}/${batch.folder}`

          finished[key] = (finished[key] || 0) + 1
          await safely(() => storage.remove(batch.id))
        } else {
          // 送れた分は登録済み。残りだけを失敗として残す
          batch.items = batch.items.slice(sent)
          batch.status = 'error'
          batch.error = errorMessage(failure)
          batch.temporary = isTemporary(failure)

          if (sent > 0) {
            const key =
              `${batch.slug}/${batch.year}/${batch.folder}`

            finished[key] = (finished[key] || 0) + 1
          }

          await safely(() => storage.put(batch))
        }

        current = null
        emit()
      }
    } finally {
      running = false
      current = null
      emit()
    }
  }

  const queue = {
    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },

    getSnapshot() {
      if (!snapshot) {
        snapshot = buildSnapshot()
      }

      return snapshot
    },

    // items: { full, thumb, width, height, kind, series }
    async enqueue({ slug, year, folder, items }) {
      const batch = {
        id: `${now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        slug,
        year,
        folder,
        items: items.map((item) => ({
          full: item.full,
          thumb: item.thumb,
          width: item.width,
          height: item.height,
          kind: item.kind,
          series: item.series || []
        })),
        createdAt: now(),
        status: 'waiting',
        error: '',
        temporary: false
      }

      batches.push(batch)
      emit()

      await safely(() => storage.put(batch))

      run()
      return batch.id
    },

    // アプリを開いたときに、前回送り残したものを読み込んで続きから送る
    async start() {
      if (started) {
        return
      }

      started = true

      let saved = []

      try {
        saved = (await storage.list()) || []
      } catch (error) {
        console.error(error)
      }

      const known =
        new Set(batches.map((batch) => batch.id))

      const restored =
        saved
          .filter((batch) => !known.has(batch.id))
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((batch) => ({
            ...batch,
            // 送信中のまま閉じたものは、もう一度送る
            status:
              batch.status === 'error' &&
              !batch.temporary
                ? 'error'
                : 'waiting'
          }))

      batches = [...restored, ...batches]
      emit()
      run()
    },

    retry(id) {
      for (const batch of batches) {
        if (
          batch.status === 'error' &&
          (!id || batch.id === id)
        ) {
          batch.status = 'waiting'
          batch.error = ''
        }
      }

      emit()
      run()
    },

    // 電波が戻ったときなどに、一時的な失敗だけを送り直す
    retryTemporary() {
      let changed = false

      for (const batch of batches) {
        if (
          batch.status === 'error' &&
          batch.temporary
        ) {
          batch.status = 'waiting'
          batch.error = ''
          changed = true
        }
      }

      if (changed) {
        emit()
        run()
      }
    },

    async discard(id) {
      batches =
        batches.filter(
          (batch) =>
            batch.id !== id ||
            batch.status === 'sending'
        )
      emit()
      await safely(() => storage.remove(id))
    },

    // テスト用: 送信が終わるまで待つ
    async idle() {
      while (running) {
        await new Promise((resolve) => {
          setTimeout(resolve, 1)
        })
      }
    }
  }

  return queue
}

const uploadQueue = createUploadQueue()

export default uploadQueue
