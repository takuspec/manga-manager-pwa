// クラウドから取得した画像・索引を、この端末に一時保存する場所。
//
// 正本はクラウドにあるので、ここは消えても困らない。
// 既存の表紙画像（manga-manager-db）とは別のデータベースにして、
// 互いの掃除処理に巻き込まれないようにしている。

const DB_NAME = 'manga-cloud-cache'
const DB_VERSION = 1
const STORE = 'entries'

// 端末に置く上限。超えたら、長く開いていないものから消す。
export const CACHE_LIMIT_BYTES =
  400 * 1024 * 1024
const PRUNE_TARGET_RATIO = 0.8
const PRUNE_INTERVAL_MS = 5 * 60 * 1000
const TOUCH_INTERVAL_MS =
  24 * 60 * 60 * 1000

let dbPromise = null
let lastPruneAt = 0

function openDb() {
  if (dbPromise) {
    return dbPromise
  }

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
            keyPath: 'key'
          })
        }
      }

      request.onsuccess = () => {
        resolve(request.result)
      }

      request.onerror = () => {
        dbPromise = null
        reject(request.error)
      }
    }
  )

  return dbPromise
}

async function withStore(mode, callback) {
  const db = await openDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)

    let result

    try {
      result = callback(store)
    } catch (error) {
      reject(error)
      return
    }

    tx.oncomplete = () => {
      resolve(result?.result ?? result)
    }
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

// キャッシュは使えなくても動くべきなので、失敗は握りつぶして「なし」扱いにする。
async function safely(action, fallback) {
  try {
    return await action()
  } catch (error) {
    console.error(error)
    return fallback
  }
}

export function cacheGet(key) {
  return safely(async () => {
    const entry =
      await withStore(
        'readonly',
        (store) => store.get(key)
      )

    if (!entry?.blob) {
      return null
    }

    // 「最後に開いた日」の更新は1日1回で十分
    if (
      Date.now() - (entry.lastUsed || 0) >
      TOUCH_INTERVAL_MS
    ) {
      withStore('readwrite', (store) => {
        store.put({
          ...entry,
          lastUsed: Date.now()
        })
      }).catch(() => {})
    }

    return entry.blob
  }, null)
}

export function cachePut(key, blob) {
  return safely(async () => {
    await withStore(
      'readwrite',
      (store) => {
        store.put({
          key,
          blob,
          size: blob.size,
          lastUsed: Date.now()
        })
      }
    )

    if (
      Date.now() - lastPruneAt >
      PRUNE_INTERVAL_MS
    ) {
      lastPruneAt = Date.now()
      cachePrune().catch(() => {})
    }
  })
}

export function cacheDelete(key) {
  return safely(() => {
    return withStore(
      'readwrite',
      (store) => {
        store.delete(key)
      }
    )
  })
}

async function listEntries() {
  const db = await openDb()

  return new Promise((resolve, reject) => {
    const entries = []

    const request =
      db
        .transaction(STORE, 'readonly')
        .objectStore(STORE)
        .openCursor()

    request.onsuccess = () => {
      const cursor = request.result

      if (!cursor) {
        resolve(entries)
        return
      }

      entries.push({
        key: cursor.value.key,
        size: cursor.value.size || 0,
        lastUsed: cursor.value.lastUsed || 0
      })

      cursor.continue()
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

export function cacheStats() {
  return safely(
    async () => {
      const entries = await listEntries()

      return {
        count: entries.length,
        bytes: entries.reduce(
          (total, entry) =>
            total + entry.size,
          0
        )
      }
    },
    {
      count: 0,
      bytes: 0
    }
  )
}

export function cachePrune(
  limitBytes = CACHE_LIMIT_BYTES
) {
  return safely(async () => {
    const entries = await listEntries()

    let total =
      entries.reduce(
        (sum, entry) => sum + entry.size,
        0
      )

    if (total <= limitBytes) {
      return
    }

    const target =
      limitBytes * PRUNE_TARGET_RATIO

    const oldestFirst =
      entries.sort(
        (a, b) => a.lastUsed - b.lastUsed
      )

    const removeKeys = []

    for (const entry of oldestFirst) {
      if (total <= target) {
        break
      }

      removeKeys.push(entry.key)
      total -= entry.size
    }

    await withStore(
      'readwrite',
      (store) => {
        removeKeys.forEach((key) => {
          store.delete(key)
        })
      }
    )
  })
}

export function cacheClear() {
  return safely(() => {
    return withStore(
      'readwrite',
      (store) => {
        store.clear()
      }
    )
  })
}
