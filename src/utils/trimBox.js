// スクリーンショットから、上部のバー（時刻・バッテリーの帯）と
// まわりの余白（白または黒の無地）を除いた範囲を求める。
//
// 画面も通信も使わない計算だけの部品。RGBA の画素配列を受け取り、
// 残す範囲を返す。うまく判定できないときは何も切らない。

// 無地とみなす明るさの範囲
const WHITE_MIN = 240
const BLACK_MAX = 14

// バーの色とみなす誤差（1色あたり）
const BAR_TOLERANCE = 12

// バーの高さの範囲（画像の高さに対する割合）
const BAR_MIN_RATIO = 0.008
const BAR_MAX_RATIO = 0.08

// この割合までの点は、余白の中の小さなごみとして無視する
const BLANK_NOISE_RATIO = 0.002

// 切った後がこれより小さくなるなら、判定の誤りとみなして切らない
const MIN_KEEP_RATIO = 0.5

// これより小さい切り落としは、やり直すほどの価値がないので行わない
const MIN_TRIM_PIXELS = 3

function isWhite(data, offset) {
  return (
    data[offset] >= WHITE_MIN &&
    data[offset + 1] >= WHITE_MIN &&
    data[offset + 2] >= WHITE_MIN
  )
}

function isBlack(data, offset) {
  return (
    data[offset] <= BLACK_MAX &&
    data[offset + 1] <= BLACK_MAX &&
    data[offset + 2] <= BLACK_MAX
  )
}

// 1行のうち、指定した色に近い点の割合
function rowMatchRatio(
  data,
  width,
  y,
  color
) {
  let match = 0
  let offset = y * width * 4

  for (let x = 0; x < width; x += 1) {
    if (
      Math.abs(data[offset] - color[0]) <=
        BAR_TOLERANCE &&
      Math.abs(data[offset + 1] - color[1]) <=
        BAR_TOLERANCE &&
      Math.abs(data[offset + 2] - color[2]) <=
        BAR_TOLERANCE
    ) {
      match += 1
    }

    offset += 4
  }

  return match / width
}

// 上部のバーの高さ。バーがなければ 0。
//
// バーの特徴: 画面の一番上から同じ地色が続き、その中に文字（時刻など）があり、
// ある行でぴたりと終わる。文字のない無地の帯は、作品の背景かもしれないので
// ここでは扱わない（白・黒の余白は後段でまとめて除く）。
export function findStatusBarHeight(
  data,
  width,
  height
) {
  const minBar =
    Math.round(height * BAR_MIN_RATIO)

  const maxBar =
    Math.round(height * BAR_MAX_RATIO)

  // 左上の角の色を地色の候補にする（文字は角までは来ない）
  const color = [data[0], data[1], data[2]]

  if (
    rowMatchRatio(data, width, 0, color) <
    0.97
  ) {
    return 0
  }

  let end = 0
  let hasText = false

  while (end < height && end <= maxBar) {
    const ratio =
      rowMatchRatio(data, width, end, color)

    if (ratio < 0.8) {
      break
    }

    if (ratio < 0.995) {
      hasText = true
    }

    end += 1
  }

  if (
    !hasText ||
    end < minBar ||
    end > maxBar ||
    end >= height
  ) {
    return 0
  }

  // 終わり方がぴたりとしているか（直後の数行が別の色になっているか）
  const checkRows =
    Math.min(3, height - end)

  for (let i = 0; i < checkRows; i += 1) {
    if (
      rowMatchRatio(
        data,
        width,
        end + i,
        color
      ) >= 0.5
    ) {
      return 0
    }
  }

  return end
}

// 指定した範囲の中で、無地（白または黒）の余白を四辺から除く。
function trimBlankMargins(
  data,
  width,
  box,
  isBlank
) {
  const rowCounts =
    new Uint32Array(box.height)

  const colCounts =
    new Uint32Array(box.width)

  for (let y = 0; y < box.height; y += 1) {
    let offset =
      ((box.y + y) * width + box.x) * 4

    for (let x = 0; x < box.width; x += 1) {
      if (!isBlank(data, offset)) {
        rowCounts[y] += 1
        colCounts[x] += 1
      }

      offset += 4
    }
  }

  const rowNoise =
    Math.max(
      2,
      Math.floor(box.width * BLANK_NOISE_RATIO)
    )

  const colNoise =
    Math.max(
      2,
      Math.floor(box.height * BLANK_NOISE_RATIO)
    )

  let top = 0
  let bottom = box.height

  while (
    top < bottom &&
    rowCounts[top] <= rowNoise
  ) {
    top += 1
  }

  while (
    bottom > top &&
    rowCounts[bottom - 1] <= rowNoise
  ) {
    bottom -= 1
  }

  let left = 0
  let right = box.width

  while (
    left < right &&
    colCounts[left] <= colNoise
  ) {
    left += 1
  }

  while (
    right > left &&
    colCounts[right - 1] <= colNoise
  ) {
    right -= 1
  }

  return {
    x: box.x + left,
    y: box.y + top,
    width: right - left,
    height: bottom - top
  }
}

export default function findContentBox(
  data,
  width,
  height
) {
  const full = {
    x: 0,
    y: 0,
    width,
    height,
    statusBar: 0,
    trimmed: false
  }

  if (
    !data ||
    width < 16 ||
    height < 16 ||
    data.length < width * height * 4
  ) {
    return full
  }

  const statusBar =
    findStatusBarHeight(data, width, height)

  let box = {
    x: 0,
    y: statusBar,
    width,
    height: height - statusBar
  }

  // 余白は白のことも黒のこともある。それぞれ試して、順に除く。
  box = trimBlankMargins(data, width, box, isWhite)
  box = trimBlankMargins(data, width, box, isBlack)

  if (
    box.width < width * MIN_KEEP_RATIO ||
    box.height < height * MIN_KEEP_RATIO
  ) {
    return full
  }

  const trimmedPixels =
    Math.max(
      box.x,
      box.y,
      width - (box.x + box.width),
      height - (box.y + box.height)
    )

  if (trimmedPixels < MIN_TRIM_PIXELS) {
    return full
  }

  return {
    ...box,
    statusBar,
    trimmed: true
  }
}
