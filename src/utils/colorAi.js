// 画像から作品を当てる（Worker 経由で Claude API を呼ぶ）
import cloudClient from './cloudClient.js'

export const AI_MAX_IMAGES = 60

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

// thumbs: サムネイルの Blob の配列。
// 返り値: { pages: [{ type, series }] | null, error: '' }
export async function analyzeThumbs(
  thumbs,
  candidates
) {
  if (
    thumbs.length === 0 ||
    thumbs.length > AI_MAX_IMAGES
  ) {
    return {
      pages: null,
      error: ''
    }
  }

  try {
    const images = []

    for (const thumb of thumbs) {
      images.push(await blobToBase64(thumb))
    }

    const result =
      await cloudClient.analyzeImages({
        candidates,
        images
      })

    return {
      pages: Array.isArray(result?.pages)
        ? result.pages
        : null,
      error: ''
    }
  } catch (error) {
    console.error(error)

    return {
      pages: null,
      error:
        error?.status === 501
          ? 'AI の設定がまだのため、作品タグと号の区切りは自動で付けていません。'
          : `作品タグを自動で付けられませんでした（${
              error?.message || '不明なエラー'
            }）。手動で付けてください。`
    }
  }
}
