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
  normalizeSlug,
  normalizeYearIndex,
  thumbKey,
  YEAR_INDEX_FORMAT,
  upsertMagazine,
  yearIndexKey
} from './colorLibrary.js'

const MAX_PARALLEL_DOWNLOADS = 4

// 作品ごとの表示では複数の年の索引をまとめて使うので、
// 読んだ索引を短い時間だけ覚えておき、画面を行き来しても読み直さない。
const YEAR_INDEX_MEMO_MS = 60 * 1000

const inFlight = new Map()
const yearIndexMemo = new Map()
let cachedRootIndex = null
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

  cachedRootIndex =
    normalizeRootIndex(result.data)

  return {
    root: cachedRootIndex,
    fromCache: result.fromCache
  }
}

// 直前に読んだ雑誌の一覧（まだ読んでいなければ null）。通信はしない。
export function getCachedRootIndex() {
  return cachedRootIndex
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
  cachedRootIndex = next
  return next
}

// maxAgeMs を指定すると、その時間内に読んだ内容があれば通信せずに返す。
export async function loadYearIndex(
  slug,
  year,
  { maxAgeMs = 0 } = {}
) {
  const key = yearIndexKey(slug, year)
  const memo = yearIndexMemo.get(key)

  if (
    memo &&
    maxAgeMs > 0 &&
    Date.now() - memo.time < maxAgeMs
  ) {
    return memo.value
  }

  const result = await readJson(key)

  const value = {
    index: normalizeYearIndex(
      result.data,
      slug,
      year
    ),
    fromCache: result.fromCache
  }

  yearIndexMemo.set(key, {
    time: Date.now(),
    value
  })

  return value
}

// 複数の年の索引をまとめて読む（作品ごとの表示用）
export async function loadYearIndexes(
  slug,
  years
) {
  const results =
    await Promise.all(
      years.map((year) =>
        schedule(() =>
          loadYearIndex(slug, year, {
            maxAgeMs: YEAR_INDEX_MEMO_MS
          })
        )
      )
    )

  return {
    indexes: results.map(
      (result) => result.index
    ),
    fromCache: results.some(
      (result) => result.fromCache
    )
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

  // ほかの端末の新しい版で保存された索引は、古い版では上書きしない
  if (
    Number(latest.data?.version) >
    YEAR_INDEX_FORMAT
  ) {
    throw new CloudError(
      'outdated',
      'アプリが古いため保存できませんでした。アプリを閉じて開き直し、更新してください。'
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

  yearIndexMemo.set(key, {
    time: Date.now(),
    value: {
      index: next,
      fromCache: false
    }
  })

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

  // 送る前にファイル名を決めておく（見開きのページから見開きを指すため）。
  // 送信は先頭から順で、失敗したらそこで止めるので、この名前のとおりに付く。
  const files =
    prepared.map((item, position) =>
      buildFileName(
        seq + position,
        item.kind || kind
      )
    )

  for (const [position, item] of prepared.entries()) {
    // 種類は1枚ごとに決められる。指定がなければ全体の指定を使う。
    const itemKind = item.kind || kind
    const file = files[position]

    const pageOf =
      Number.isInteger(item.pageOf) &&
      item.pageOf >= 0 &&
      item.pageOf < files.length &&
      item.pageOf !== position
        ? files[item.pageOf]
        : ''

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
        kind: itemKind,
        series: item.series || [],
        pageOf,
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

// ---- 雑誌の名前とフォルダ名の変更 ----

// 通信回数の上限（1分あたり）に達したら、少し待ってから続ける。
// 大量の画像を移すときに、途中で止まらないようにするため。
const PACING_WAIT_MS = 15 * 1000

async function paced(action) {
  for (;;) {
    try {
      return await action()
    } catch (error) {
      if (
        error instanceof CloudError &&
        error.code === 'too_many_requests'
      ) {
        await new Promise((resolve) => {
          setTimeout(resolve, PACING_WAIT_MS)
        })
        continue
      }

      throw error
    }
  }
}

function offlineError() {
  return new CloudError(
    'network',
    '通信できないため変更できませんでした。'
  )
}

// フォルダ名を変えるときは、登録済みの画像をすべて新しい場所へ写してから
// 一覧を切り替え、最後に古いファイルを消す。
// 途中で失敗しても、切り替え前なら元の状態のまま使える。
export async function renameMagazine({
  from,
  to,
  name,
  onProgress
}) {
  const target = normalizeSlug(to)

  if (!target) {
    throw new CloudError(
      'invalid_slug',
      'フォルダ名は半角の英小文字・数字・ハイフンで入力してください（例: jump）。'
    )
  }

  const latest = await readJson(ROOT_INDEX_KEY)

  if (latest.fromCache) {
    throw offlineError()
  }

  const root = normalizeRootIndex(latest.data)

  const magazine =
    root.magazines.find(
      (item) => item.slug === from
    )

  if (!magazine) {
    throw new CloudError(
      'not_found',
      'この雑誌は登録されていません。'
    )
  }

  const cleanName =
    String(name ?? '').trim() || magazine.name

  // 名前だけの変更は、一覧を書き換えるだけ
  if (target === from) {
    const next =
      await updateRootIndex((current) =>
        upsertMagazine(current, {
          slug: from,
          name: cleanName
        })
      )

    return {
      magazine: next.magazines.find(
        (item) => item.slug === from
      ),
      leftover: 0
    }
  }

  if (
    root.magazines.some(
      (item) => item.slug === target
    )
  ) {
    throw new CloudError(
      'slug_taken',
      'そのフォルダ名はすでに使われています。'
    )
  }

  // 1. 年ごとの索引を読み、移すファイルを洗い出す
  const years = []

  for (const year of magazine.years) {
    const result =
      await paced(() =>
        readJson(yearIndexKey(from, year))
      )

    if (result.fromCache) {
      throw offlineError()
    }

    years.push({
      year,
      index: normalizeYearIndex(
        result.data,
        from,
        year
      )
    })
  }

  const moves = []

  for (const { year, index } of years) {
    for (const [folder, issue] of Object.entries(
      index.issues
    )) {
      for (const image of issue.images) {
        moves.push(
          [
            imageKey(from, year, folder, image.file),
            imageKey(target, year, folder, image.file)
          ],
          [
            thumbKey(from, year, folder, image.file),
            thumbKey(target, year, folder, image.file)
          ]
        )
      }
    }
  }

  // 2. 新しい場所へ写す（元のファイルはまだ消さない）
  let done = 0

  for (const [oldKey, newKey] of moves) {
    let blob = null

    try {
      blob =
        await paced(() =>
          cloudClient.getFile(oldKey)
        )
    } catch (error) {
      // 元から無いファイル（縮小版の作り損ねなど）は飛ばす
      if (!isNotFound(error)) {
        throw error
      }
    }

    if (blob) {
      await paced(() =>
        cloudClient.putFile(
          newKey,
          blob,
          'image/jpeg'
        )
      )
    }

    done += 1
    onProgress?.({
      phase: 'copy',
      done,
      total: moves.length
    })
  }

  // 3. 新しい場所の索引を書き、雑誌の一覧を切り替える
  for (const { year, index } of years) {
    await paced(() =>
      writeJson(
        yearIndexKey(target, year),
        normalizeYearIndex(
          index,
          target,
          year
        )
      )
    )
  }

  const next =
    await paced(() =>
      updateRootIndex((current) => {
        const changed =
          normalizeRootIndex(current)

        const item =
          changed.magazines.find(
            (entry) => entry.slug === from
          )

        if (!item) {
          throw new CloudError(
            'not_found',
            'この雑誌は登録されていません。'
          )
        }

        item.slug = target
        item.name = cleanName
        return changed
      })
    )

  // 4. 古いファイルを消す。失敗しても、表示には影響しない
  const oldKeys = [
    ...moves.map(([oldKey]) => oldKey),
    ...years.map(({ year }) =>
      yearIndexKey(from, year)
    )
  ]

  let leftover = 0
  let cleaned = 0

  for (const key of oldKeys) {
    try {
      await paced(() =>
        cloudClient.deleteFile(key)
      )
      cacheDelete(key)
    } catch (error) {
      console.error(error)
      leftover += 1
    }

    cleaned += 1
    onProgress?.({
      phase: 'cleanup',
      done: cleaned,
      total: oldKeys.length
    })
  }

  return {
    magazine: next.magazines.find(
      (item) => item.slug === target
    ),
    leftover
  }
}
