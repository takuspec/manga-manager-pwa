// 画像から表紙・目次と作品を当てる（Worker 経由で Claude API を呼ぶ）。
// 取り違えを防ぐため、画像は1枚ずつ判定する。
//  1. 小さくした画像で、表紙・目次・カラーのどれかを判定
//  2. 号ごとに目次を添えて、カラーページ（と表紙）の作品を判定
import cloudClient from './cloudClient.js'
import {
  groupByStarts,
  splitStarts
} from './colorBulk.js'

export const AI_MAX_IMAGES = 120

// 同時に送る数（API の回数制限に引っかからない程度）
const CONCURRENCY = 3

export async function blobToBase64(blob) {
  const bytes =
    new Uint8Array(await blob.arrayBuffer())

  let binary = ''
  const chunk = 0x8000

  for (
    let index = 0;
    index < bytes.length;
    index += chunk
  ) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(index, index + chunk)
    )
  }

  return btoa(binary)
}

// 長い辺を maxEdge 以下にした JPEG
async function resizeJpeg(blob, maxEdge, quality) {
  const bitmap = await createImageBitmap(blob)

  try {
    const scale =
      Math.min(
        1,
        maxEdge /
          Math.max(bitmap.width, bitmap.height)
      )

    const canvas =
      document.createElement('canvas')

    canvas.width =
      Math.max(1, Math.round(bitmap.width * scale))
    canvas.height =
      Math.max(1, Math.round(bitmap.height * scale))

    canvas
      .getContext('2d')
      .drawImage(
        bitmap,
        0,
        0,
        canvas.width,
        canvas.height
      )

    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error('encode failed')),
        'image/jpeg',
        quality
      )
    })
  } finally {
    bitmap.close?.()
  }
}

async function runPool(count, worker) {
  let next = 0

  const lanes =
    Array.from(
      { length: Math.min(CONCURRENCY, count) },
      async () => {
        while (next < count) {
          const index = next

          next += 1
          await worker(index)
        }
      }
    )

  await Promise.all(lanes)
}

// AI が使えない（設定がまだ・クレジット切れなど）。残りの判定もやめる
class NotConfigured extends Error {}

const AI_STOP_MESSAGES = {
  501: 'AI の設定がまだのため、作品タグと号の区切りは自動で付けていません。',
  402: 'AI が使えませんでした（クレジット切れか、API キーが無効です）。作品タグは手動で付けてください。'
}

let stopped = null

async function ask(payload) {
  if (stopped) {
    throw new NotConfigured(stopped)
  }

  try {
    return await cloudClient.analyzeImage(payload)
  } catch (error) {
    if (AI_STOP_MESSAGES[error?.status]) {
      stopped = AI_STOP_MESSAGES[error.status]
      throw new NotConfigured(stopped)
    }

    throw error
  }
}

// images: [{ thumb, full }]
// splitByCovers: 表紙ごとに号を区切るか（何号分もまとめて追加のとき）
// candidatesFor(groupIndex): その号の作品の候補
// 返り値: { types, starts, series, error }
export async function analyzePages({
  images,
  splitByCovers,
  magazine = '',
  candidatesFor,
  onProgress = () => {}
}) {
  const count = images.length
  const types = images.map(() => 'color')
  const series = images.map(() => [])
  let failures = 0
  let done = 0

  // 前回止まっていても、新しく選んだときはもう一度試す
  stopped = null

  const fallbackStarts =
    images.map((_, index) => index === 0)

  if (count === 0 || count > AI_MAX_IMAGES) {
    return {
      types,
      starts: fallbackStarts,
      series,
      error: ''
    }
  }

  // 途中で止まっても、そこまでの判定（号の区切り）は使う
  let starts = fallbackStarts

  try {
    // 1. 種類（表紙・目次・カラー）
    await runPool(count, async (index) => {
      try {
        const result =
          await ask({
            task: 'classify',
            magazine,
            image:
              await blobToBase64(
                images[index].thumb
              )
          })

        types[index] = result?.type || 'color'
      } catch (error) {
        if (error instanceof NotConfigured) {
          throw error
        }

        console.error(error)
        failures += 1
      } finally {
        done += 1
        onProgress(done, count * 2)
      }
    })

    // 表紙として認めるのは、縦長で、直前が目次の画像だけ
    // （各号は「表紙 → カラー → 目次」の順で、目次の次は次の号の表紙）。
    // それ以外で表紙と判定されたものはカラーページとして扱う
    if (splitByCovers) {
      types.forEach((type, index) => {
        if (type !== 'cover') {
          return
        }

        const portrait =
          images[index].width <
          images[index].height

        const afterToc =
          index === 0 ||
          types[index - 1] === 'toc'

        if (!portrait || !afterToc) {
          types[index] = 'color'
        }
      })
    }

    starts =
      splitByCovers
        ? splitStarts(
            types.map((type) => ({ type }))
          )
        : fallbackStarts

    const groups = groupByStarts(starts)

    // 目次は各号の最後（次の表紙の直前）にある。
    // 何号分もまとめて追加するときは、各号の最後を目次とする。
    // それ以外の位置で目次と判定されたものは、カラーページとして扱う
    for (const group of groups) {
      group.forEach((index, position) => {
        const isLast =
          position === group.length - 1

        if (
          splitByCovers &&
          isLast &&
          group.length > 1
        ) {
          types[index] = 'toc'
        } else if (
          types[index] === 'toc' &&
          !isLast
        ) {
          types[index] = 'color'
        }
      })
    }

    // 2. 号ごとに目次を添えて、作品を判定
    const jobs = []

    for (const [
      groupIndex,
      group
    ] of groups.entries()) {
      const candidates =
        candidatesFor(groupIndex)

      const tocIndex =
        group.find(
          (index) => types[index] === 'toc'
        )

      let toc = null

      if (tocIndex !== undefined) {
        try {
          toc =
            await blobToBase64(
              await resizeJpeg(
                images[tocIndex].full,
                1400,
                0.85
              )
            )
        } catch (error) {
          console.error(error)
        }
      }

      for (const index of group) {
        if (
          types[index] === 'toc' ||
          types[index] === 'other'
        ) {
          continue
        }

        jobs.push({ index, toc, candidates })
      }
    }

    done = count
    onProgress(done, count + jobs.length)

    await runPool(jobs.length, async (position) => {
      const job = jobs[position]

      try {
        const result =
          await ask({
            task: 'series',
            image:
              await blobToBase64(
                images[job.index].thumb
              ),
            toc: job.toc,
            candidates: job.candidates
          })

        series[job.index] =
          Array.isArray(result?.series)
            ? result.series
            : []
      } catch (error) {
        if (error instanceof NotConfigured) {
          throw error
        }

        console.error(error)
        failures += 1
      } finally {
        done += 1
        onProgress(done, count + jobs.length)
      }
    })

    return {
      types,
      starts,
      series,
      error:
        failures > 0
          ? `${failures} 件は AI で判定できませんでした。手動で直してください。`
          : ''
    }
  } catch (error) {
    if (error instanceof NotConfigured) {
      return {
        types,
        starts,
        series,
        error: error.message
      }
    }

    console.error(error)

    return {
      types,
      starts,
      series,
      error: `AI で判定できませんでした（${
        error?.message || '不明なエラー'
      }）。手動で付けてください。`
    }
  }
}
