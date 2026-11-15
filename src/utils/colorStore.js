// カラーページの読み書き。クラウド（cloudClient）と端末内キャッシュをつなぐ。
//
// 通信回数を増やさないための決まり
// ・画像は一度取得したら端末に保存し、次からは通信しない
// ・同じものを同時に何度も取りに行かない（取得中のものは相乗りする）
// ・同時に走らせる取得は4件まで

import cloudClient, {
  CloudError
} from './cloudClient.js'
import {
  cacheDelete,
  cacheGet,
  cachePut
} from './cloudImageCache.js'
import {
  ROOT_INDEX_KEY,
  addImagesToIssue,
  addYearToMagazine,
  buildFileName,
  imageKey,
  nextSequence,
  normalizeRootIndex,
  normalizeYearIndex,
  thumbKey,
  yearIndexKey
} from './colorLibrary.js'

const MAX_PARALLEL_DOWNLOADS = 4

const inFlight = new Map()
const waiting = []
let running = 0

function schedule(task) {
  return new Promise((resolve, reject) => {
    const run = () => {
      running += 1

      task()
        .then(resolve, reject)
        .finally(() => {
          running -= 1

          const next = waiting.shift()

          if (next) {
            next()
          }
        })
    }

    if (running < MAX_PARALLEL_DOWNLOADS) {
      run()
    } else {
      waiting.push(run)
    }
  })
}

function isNotFound(error) {
  return (
    error instanceof CloudError &&
    error.status === 404
  )
}

function isOffline(error) {
  return (
    error instanceof CloudError &&
    (error.code === 'network' ||
      error.code === 'timeout' ||
      error.code === 'paused' ||
      error.code === 'too_many_requests')
  )
}

// 索引（JSON）を読む。なければ null。
// 通信できないときは、前回読んだ内容を使う（fromCache: true）。
async function readJson(key) {
  try {
    const blob =
      await cloudClient.getFile(key)

    const data =
      JSON.parse(await blob.text())

    cachePut(key, blob)

    return {
      data,
      fromCache: false
    }
  } catch (error) {
    if (isNotFound(error)) {
      return {
        data: null,
        fromCache: false
      }
    }

    if (isOffline(error)) {
      const cached = await cacheGet(key)

      if (cached) {
        return {
          data: JSON.parse(
            await cached.text()
          ),
          fromCache: true
        }
      }
    }

    throw error
  }
}

async function writeJson(key, data) {
  const blob =
    new Blob([JSON.stringify(data)], {
      type: 'application/json'
    })

  await cloudClient.putFile(
    key,
    blob,
    'application/json'
  )

  cachePut(key, blob)
}

export async function loadRootIndex() {
  const result =
    await readJson(ROOT_INDEX_KEY)

  return {
    root: normalizeRootIndex(result.data),
    fromCache: result.fromCache
  }
}

// 書き込みの直前に最新を読み直してから変更を当てる。
// iPhone と iPad で続けて登録しても、互いの変更を消さないため。
export async function updateRootIndex(
  change
) {
  const latest =
    await readJson(ROOT_INDEX_KEY)

  if (latest.fromCache) {
    throw new CloudError(
      'network',
      '通信できないため保存できませんでした。'
    )
  }

  const next =
    normalizeRootIndex(
      change(
        normalizeRootIndex(latest.data)
      )
    )

  await writeJson(ROOT_INDEX_KEY, next)
  return next
}

export async function loadYearIndex(
  slug,
  year
) {
  const result =
    await readJson(
      yearIndexKey(slug, year)
    )

  return {
    index: normalizeYearIndex(
      result.data,
      slug,
      year
    ),
    fromCache: result.fromCache
  }
}

export async function updateYearIndex(
  slug,
  year,
  change
) {
  const key = yearIndexKey(slug, year)
  const latest = await readJson(key)

  if (latest.fromCache) {
    throw new CloudError(
      'network',
      '通信できないため保存できませんでした。'
    )
  }

  const next =
    normalizeYearIndex(
      change(
        normalizeYearIndex(
          latest.data,
          slug,
          year
        )
      ),
      slug,
      year
    )

  await writeJson(key, next)
  return next
}

// 画像を取得する。端末にあれば通信しない。
export function getImageBlob(key) {
  const pending = inFlight.get(key)

  if (pending) {
    return pending
  }

  const promise =
    (async () => {
      const cached = await cacheGet(key)

      if (cached) {
        return cached
      }

      const blob =
        await schedule(() =>
          cloudClient.getFile(key)
        )

      cachePut(key, blob)
      return blob
    })().finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, promise)
  return promise
}

// 用意済みの画像を1件ずつ送り、最後に索引へまとめて記録する。
// 途中で失敗しても、送れた分までは記録する。
export async function uploadImages({
  slug,
  year,
  folder,
  kind,
  prepared,
  onProgress
}) {
  const added = []
  let failure = null

  // 別の端末が同じ号に追加していても番号が重ならないよう、
  // 送る直前に最新の索引から次の番号を決める。
  const latest =
    await loadYearIndex(slug, year)

  if (latest.fromCache) {
    throw new CloudError(
      'network',
      '通信できないため登録できませんでした。'
    )
  }

  let seq =
    nextSequence(
      latest.index.issues[folder]?.images
    )

  for (const item of prepared) {
    const file = buildFileName(seq, kind)

    try {
      const fullKey =
        imageKey(slug, year, folder, file)

      const smallKey =
        thumbKey(slug, year, folder, file)

      await cloudClient.putFile(
        fullKey,
        item.full,
        'image/jpeg'
      )
      await cloudClient.putFile(
        smallKey,
        item.thumb,
        'image/jpeg'
      )

      // 登録した端末では、取り直さずにそのまま表示できるようにする
      cachePut(fullKey, item.full)
      cachePut(smallKey, item.thumb)

      added.push({
        file,
        seq,
        kind,
        width: item.width,
        height: item.height,
        bytes: item.full.size,
        addedAt: new Date().toISOString()
      })

      seq += 1
      onProgress?.(added.length)
    } catch (error) {
      failure = error
      break
    }
  }

  let index = null

  if (added.length > 0) {
    index =
      await updateYearIndex(
        slug,
        year,
        (current) =>
          addImagesToIssue(
            current,
            folder,
            added
          )
      )

    await updateRootIndex((root) =>
      addYearToMagazine(root, slug, year)
    )
  }

  return {
    index,
    added,
    failure
  }
}

export async function deleteImageFiles(
  slug,
  year,
  folder,
  file
) {
  const fullKey =
    imageKey(slug, year, folder, file)

  const smallKey =
    thumbKey(slug, year, folder, file)

  await cloudClient.deleteFile(fullKey)
  await cloudClient.deleteFile(smallKey)

  cacheDelete(fullKey)
  cacheDelete(smallKey)
}
