// 選んだ画像を、アップロード用の本体と一覧用の縮小版にする。
//
// ・本体は元の解像度のまま。JPEG 以外（スクリーンショットの PNG など）だけ
//   高品質の JPEG に変換する。もともと JPEG のものは再圧縮しない。
// ・縮小版は一覧表示専用。
// ・trim を指定すると、上部のバーと余白を切り落とす。
//   雑誌ごとの固定値（crops）があればそれを使い、なければ画像から判定する
//   （判定は trimBox.js）。

import findContentBox from './trimBox.js'
import { pickCropBox } from './colorLibrary.js'

const FULL_JPEG_QUALITY = 0.9
const THUMB_LONG_EDGE = 480
const THUMB_JPEG_QUALITY = 0.8

// iOS の canvas が扱える面積の上限（約1,670万画素）より少し内側
const MAX_CANVAS_PIXELS = 16_000_000

async function loadSource(file) {
  if (
    typeof createImageBitmap === 'function'
  ) {
    try {
      const bitmap =
        await createImageBitmap(file, {
          imageOrientation: 'from-image'
        })

      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close()
      }
    } catch {
      // 下の <img> 方式にフォールバック
    }
  }

  const url = URL.createObjectURL(file)

  try {
    const image =
      await new Promise(
        (resolve, reject) => {
          const element = new Image()

          element.onload = () =>
            resolve(element)
          element.onerror = () =>
            reject(
              new Error(
                'image decode failed'
              )
            )
          element.src = url
        }
      )

    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () =>
        URL.revokeObjectURL(url)
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

// 元画像の一部（box）を、指定した倍率で JPEG にする
function render(source, box, scale, quality) {
  const width =
    Math.max(
      1,
      Math.round(box.width * scale)
    )

  const height =
    Math.max(
      1,
      Math.round(box.height * scale)
    )

  const canvas =
    document.createElement('canvas')

  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error(
      'Canvas context is not available'
    )
  }

  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(
    source.image,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    width,
    height
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(
            new Error(
              'Failed to create image blob'
            )
          )
          return
        }

        resolve({
          blob,
          width,
          height
        })
      },
      'image/jpeg',
      quality
    )
  })
}

// 切り落とす範囲を調べる。調べられないときは全体を返す。
function detectContentBox(source) {
  const full = {
    x: 0,
    y: 0,
    width: source.width,
    height: source.height,
    trimmed: false
  }

  if (
    source.width * source.height >
    MAX_CANVAS_PIXELS
  ) {
    return full
  }

  try {
    const canvas =
      document.createElement('canvas')

    canvas.width = source.width
    canvas.height = source.height

    const ctx =
      canvas.getContext('2d', {
        willReadFrequently: true
      })

    if (!ctx) {
      return full
    }

    ctx.drawImage(source.image, 0, 0)

    return findContentBox(
      ctx.getImageData(
        0,
        0,
        source.width,
        source.height
      ).data,
      source.width,
      source.height
    )
  } catch (error) {
    console.error(error)
    return full
  }
}

function chooseBox(source, trim, crops) {
  if (!trim) {
    return {
      x: 0,
      y: 0,
      width: source.width,
      height: source.height,
      trimmed: false,
      trimMode: 'none'
    }
  }

  const fixed =
    pickCropBox(
      crops,
      source.width,
      source.height
    )

  if (fixed) {
    return {
      ...fixed,
      trimmed:
        fixed.width !== source.width ||
        fixed.height !== source.height,
      trimMode: 'fixed'
    }
  }

  return {
    ...detectContentBox(source),
    trimMode: 'auto'
  }
}

export default async function prepareImage(
  file,
  { trim = false, crops = null } = {}
) {
  const source = await loadSource(file)

  try {
    const box =
      chooseBox(source, trim, crops)

    const thumb =
      await render(
        source,
        box,
        Math.min(
          1,
          THUMB_LONG_EDGE /
            Math.max(box.width, box.height)
        ),
        THUMB_JPEG_QUALITY
      )

    // 切り落としも変換も要らない JPEG は、元のファイルをそのまま使う
    if (
      file.type === 'image/jpeg' &&
      !box.trimmed
    ) {
      return {
        full: file,
        thumb: thumb.blob,
        width: source.width,
        height: source.height,
        trimmed: false,
        trimMode: box.trimMode
      }
    }

    const pixels = box.width * box.height

    const full =
      await render(
        source,
        box,
        pixels > MAX_CANVAS_PIXELS
          ? Math.sqrt(
              MAX_CANVAS_PIXELS / pixels
            )
          : 1,
        FULL_JPEG_QUALITY
      )

    return {
      full: full.blob,
      thumb: thumb.blob,
      width: full.width,
      height: full.height,
      trimmed: box.trimmed,
      trimMode: box.trimMode
    }
  } finally {
    source.release()
  }
}
