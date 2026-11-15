// 表紙画像を保存前に縮小・再圧縮する。
// 上限は cropImage.js（トリミング保存）と同じ値にそろえている。
const DEFAULT_MAX_WIDTH = 600
const DEFAULT_MAX_HEIGHT = 800
const DEFAULT_JPEG_QUALITY = 0.78

export default async function compressImage(
  blob,
  {
    maxWidth = DEFAULT_MAX_WIDTH,
    maxHeight = DEFAULT_MAX_HEIGHT,
    quality = DEFAULT_JPEG_QUALITY
  } = {}
) {
  if (
    !(blob instanceof Blob) ||
    !blob.type.startsWith('image/') ||
    blob.type === 'image/gif'
  ) {
    return blob
  }

  try {
    const source =
      await loadImageSource(blob)

    const scale =
      Math.min(
        1,
        maxWidth / source.width,
        maxHeight / source.height
      )

    const canvas =
      document.createElement('canvas')

    canvas.width =
      Math.max(
        1,
        Math.round(source.width * scale)
      )
    canvas.height =
      Math.max(
        1,
        Math.round(source.height * scale)
      )

    const ctx =
      canvas.getContext('2d')

    if (!ctx) {
      source.release()
      return blob
    }

    // 透過PNGをJPEGにしたとき背景が黒くならないようにする
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    )
    ctx.drawImage(
      source.image,
      0,
      0,
      canvas.width,
      canvas.height
    )
    source.release()

    const compressed =
      await new Promise((resolve) => {
        canvas.toBlob(
          resolve,
          'image/jpeg',
          quality
        )
      })

    // 小さくならなかった場合は元の画像をそのまま使う
    return compressed &&
      compressed.size < blob.size
      ? compressed
      : blob
  } catch (error) {
    console.error(
      'image compression failed:',
      error
    )
    return blob
  }
}

async function loadImageSource(blob) {
  if (
    typeof createImageBitmap === 'function'
  ) {
    try {
      const bitmap =
        await createImageBitmap(
          blob,
          {
            imageOrientation: 'from-image'
          }
        )

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

  const url =
    URL.createObjectURL(blob)

  try {
    const image =
      await new Promise(
        (resolve, reject) => {
          const element =
            new Image()

          element.onload = () =>
            resolve(element)
          element.onerror = reject
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
