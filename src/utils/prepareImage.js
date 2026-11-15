// 選んだ画像を、アップロード用の本体と一覧用の縮小版にする。
//
// ・本体は元の解像度のまま。JPEG 以外（スクリーンショットの PNG など）だけ
//   高品質の JPEG に変換する。もともと JPEG のものは再圧縮しない。
// ・縮小版は一覧表示専用。

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

function render(source, scale, quality) {
  const width =
    Math.max(
      1,
      Math.round(source.width * scale)
    )

  const height =
    Math.max(
      1,
      Math.round(source.height * scale)
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

export default async function prepareImage(
  file
) {
  const source = await loadSource(file)

  try {
    const thumb =
      await render(
        source,
        Math.min(
          1,
          THUMB_LONG_EDGE /
            Math.max(
              source.width,
              source.height
            )
        ),
        THUMB_JPEG_QUALITY
      )

    if (file.type === 'image/jpeg') {
      return {
        full: file,
        thumb: thumb.blob,
        width: source.width,
        height: source.height
      }
    }

    const pixels =
      source.width * source.height

    const full =
      await render(
        source,
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
      height: full.height
    }
  } finally {
    source.release()
  }
}
