import test from 'node:test'
import assert from 'node:assert/strict'
import findContentBox, {
  findStatusBarHeight
} from '../../src/utils/trimBox.js'

// テスト用の画像を作る。全体を1色で塗り、指定した四角を別の色で塗っていく。
function createImage(width, height, base) {
  const data =
    new Uint8ClampedArray(width * height * 4)

  const fill = (x, y, w, h, color) => {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) {
        const offset = (row * width + col) * 4

        data[offset] = color[0]
        data[offset + 1] = color[1]
        data[offset + 2] = color[2]
        data[offset + 3] = 255
      }
    }
  }

  // 絵の部分。無地にならないよう、場所ごとに色を変える。
  const paint = (x, y, w, h) => {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) {
        const offset = (row * width + col) * 4

        data[offset] = 40 + ((col * 7) % 160)
        data[offset + 1] = 60 + ((row * 5) % 150)
        data[offset + 2] = 90 + (((col + row) * 3) % 120)
        data[offset + 3] = 255
      }
    }
  }

  fill(0, 0, width, height, base)

  return { data, width, height, fill, paint }
}

const WHITE = [255, 255, 255]
const BLACK = [0, 0, 0]
const BAR = [61, 61, 61]

const box = (image) =>
  findContentBox(
    image.data,
    image.width,
    image.height
  )

test('左右の白い余白を除く', () => {
  const image = createImage(400, 600, WHITE)

  image.paint(20, 0, 360, 600)

  assert.deepEqual(box(image), {
    x: 20,
    y: 0,
    width: 360,
    height: 600,
    statusBar: 0,
    trimmed: true
  })
})

test('上部のバーと、その下の余白を除く', () => {
  const image = createImage(400, 600, WHITE)

  image.fill(0, 0, 400, 14, BAR)
  // 時刻とバッテリーの表示にあたる部分
  image.fill(8, 4, 30, 6, WHITE)
  image.fill(370, 4, 20, 6, WHITE)
  image.paint(0, 14, 400, 570)

  assert.equal(
    findStatusBarHeight(
      image.data,
      image.width,
      image.height
    ),
    14
  )

  assert.deepEqual(box(image), {
    x: 0,
    y: 14,
    width: 400,
    height: 570,
    statusBar: 14,
    trimmed: true
  })
})

test('バーの下が白い余白でも正しく除く', () => {
  const image = createImage(400, 600, WHITE)

  image.fill(0, 0, 400, 14, BAR)
  image.fill(8, 4, 30, 6, WHITE)
  image.paint(30, 14, 340, 586)

  assert.deepEqual(box(image), {
    x: 30,
    y: 14,
    width: 340,
    height: 586,
    statusBar: 14,
    trimmed: true
  })
})

test('文字のない濃い色の帯は作品の一部として残す', () => {
  const image = createImage(400, 600, WHITE)

  image.fill(0, 0, 400, 14, BAR)
  image.paint(0, 14, 400, 586)

  assert.equal(
    findStatusBarHeight(
      image.data,
      image.width,
      image.height
    ),
    0
  )
  assert.equal(box(image).trimmed, false)
})

test('高すぎる帯はバーとみなさない', () => {
  const image = createImage(400, 600, WHITE)

  image.fill(0, 0, 400, 120, BAR)
  image.fill(8, 4, 30, 6, WHITE)
  image.paint(0, 120, 400, 480)

  assert.equal(box(image).statusBar, 0)
})

test('黒い余白（ダークモード）も除く', () => {
  const image = createImage(600, 400, BLACK)

  image.paint(0, 25, 600, 350)

  assert.deepEqual(box(image), {
    x: 0,
    y: 25,
    width: 600,
    height: 350,
    statusBar: 0,
    trimmed: true
  })
})

test('余白の中の小さなごみは無視する', () => {
  const image = createImage(1000, 1000, WHITE)

  image.paint(100, 0, 800, 1000)
  image.fill(10, 500, 1, 1, [0, 0, 0])

  assert.equal(box(image).x, 100)
})

test('余白がなければ何もしない', () => {
  const image = createImage(400, 600, WHITE)

  image.paint(0, 0, 400, 600)

  assert.deepEqual(box(image), {
    x: 0,
    y: 0,
    width: 400,
    height: 600,
    statusBar: 0,
    trimmed: false
  })
})

test('ほとんど白い画像は、切りすぎを避けて何もしない', () => {
  const image = createImage(400, 600, WHITE)

  image.paint(180, 280, 40, 40)

  assert.equal(box(image).trimmed, false)
  assert.equal(box(image).width, 400)
})

test('壊れた入力では何もしない', () => {
  assert.equal(
    findContentBox(null, 100, 100).trimmed,
    false
  )
  assert.equal(
    findContentBox(
      new Uint8ClampedArray(10),
      100,
      100
    ).trimmed,
    false
  )
})
