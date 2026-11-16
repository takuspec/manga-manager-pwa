// カラーページ（号ごとの画像）の保存先の決まりと、索引の操作。
//
// クラウド上の並び（他のツールからもそのまま読める形）
//   index.json                       雑誌の一覧
//   jump/2026/index.json             その年の号と画像の一覧
//   jump/2026/50/01-cover.jpg        画像本体（元の解像度のまま）
//   _thumbs/jump/2026/50/01-cover.jpg 一覧用の縮小版
//
// ここは通信も画面も持たない計算だけの部品なので、単体でテストできる。

export const ROOT_INDEX_KEY = 'index.json'
export const THUMB_PREFIX = '_thumbs/'
export const MIN_YEAR = 1950
export const MAX_YEAR = 2100

// 画像の種類は掲載位置で分ける。見開きか縦かは、画像の縦横から自動で決まる。
export const IMAGE_KINDS = [
  { id: 'cover', label: '表紙' },
  { id: 'opening', label: '巻頭カラー' },
  { id: 'center', label: 'センターカラー' },
  { id: 'other', label: 'その他' }
]

const KIND_IDS =
  new Set(IMAGE_KINDS.map((kind) => kind.id))

// 以前の種類名。「見開き」で登録したものは巻頭カラーとして扱う
// （ファイル名はそのまま）。
const LEGACY_KINDS = {
  spread: 'opening'
}

// 保存先の最上位で、雑誌フォルダ以外に使っている名前
const RESERVED_SLUGS = new Set(['index'])

function pad2(value) {
  return String(value).padStart(2, '0')
}

export function getKindLabel(kindId) {
  return (
    IMAGE_KINDS.find(
      (kind) => kind.id === kindId
    )?.label || 'その他'
  )
}

export function normalizeKind(kindId) {
  const kind =
    LEGACY_KINDS[kindId] || kindId

  return KIND_IDS.has(kind)
    ? kind
    : 'other'
}

export function isSpreadSize(size) {
  return (
    Number(size?.width) >
    Number(size?.height) * 1.1
  )
}

// 一覧などに出す名前。例: 「巻頭カラー・見開き」「センターカラー・縦」
export function getImageLabel(image) {
  const kind = getKindLabel(
    normalizeKind(image?.kind)
  )

  if (!image?.width || !image?.height) {
    return kind
  }

  return `${kind}・${
    isSpreadSize(image) ? '見開き' : '縦'
  }`
}

// 雑誌のフォルダ名。半角の英小文字・数字・ハイフンだけ。
export function normalizeSlug(value) {
  const slug =
    String(value || '')
      .trim()
      .toLowerCase()

  if (
    !/^[a-z0-9][a-z0-9-]{0,30}$/.test(slug) ||
    RESERVED_SLUGS.has(slug)
  ) {
    return ''
  }

  return slug
}

export function normalizeYear(value) {
  const year = Number(value)

  return Number.isInteger(year) &&
    year >= MIN_YEAR &&
    year <= MAX_YEAR
    ? year
    : 0
}

// 号の入力を読み取る。「50」「4-5」「4・5」（合併号）を受け付ける。
export function parseIssueLabel(value) {
  const text =
    String(value ?? '')
      .trim()
      .replace(/[０-９]/g, (digit) =>
        String.fromCharCode(
          digit.charCodeAt(0) - 0xfee0
        )
      )
      .replace(/号/g, '')
      .replace(/[・･/~〜ー－―‐]/g, '-')
      .replace(/\s+/g, '')

  const match =
    /^(\d{1,2})(?:-(\d{1,2}))?$/.exec(text)

  if (!match) {
    return null
  }

  const start = Number(match[1])
  const end =
    match[2] === undefined
      ? null
      : Number(match[2])

  if (
    start < 1 ||
    (end !== null && end <= start)
  ) {
    return null
  }

  return {
    start,
    end
  }
}

// 号のフォルダ名。「50」「04-05」
export function issueFolder(issue) {
  return issue.end === null
    ? pad2(issue.start)
    : `${pad2(issue.start)}-${pad2(issue.end)}`
}

export function parseIssueFolder(folder) {
  const match =
    /^(\d{2})(?:-(\d{2}))?$/.exec(
      String(folder || '')
    )

  if (!match) {
    return null
  }

  return parseIssueLabel(
    match[2] === undefined
      ? match[1]
      : `${match[1]}-${match[2]}`
  )
}

export function formatIssueFolder(folder) {
  const issue = parseIssueFolder(folder)

  if (!issue) {
    return String(folder)
  }

  return issue.end === null
    ? `${issue.start}号`
    : `${issue.start}・${issue.end}合併号`
}

export function compareIssueFolders(a, b) {
  const first = parseIssueFolder(a)
  const second = parseIssueFolder(b)

  return (
    (first?.start || 0) -
      (second?.start || 0) ||
    String(a).localeCompare(String(b))
  )
}

export function yearIndexKey(slug, year) {
  return `${slug}/${year}/index.json`
}

export function imageKey(
  slug,
  year,
  folder,
  fileName
) {
  return `${slug}/${year}/${folder}/${fileName}`
}

export function thumbKey(
  slug,
  year,
  folder,
  fileName
) {
  return (
    THUMB_PREFIX +
    imageKey(slug, year, folder, fileName)
  )
}

export function buildFileName(seq, kindId) {
  return `${pad2(seq)}-${normalizeKind(
    kindId
  )}.jpg`
}

// その号でまだ使っていない通し番号。
// 削除した番号を使い回さないので、ファイル名が重ならない。
export function nextSequence(images) {
  return (
    (images || []).reduce(
      (max, image) => {
        return Math.max(
          max,
          Number(image.seq) || 0
        )
      },
      0
    ) + 1
  )
}

// ---- 切り落としの固定値 ----
//
// 雑誌ごとにページの縦横比は決まっているので、スクリーンショットから
// 除く範囲も「雑誌 × 縦長／横長」で固定できる。
// 値は「元画像の大きさ」と「上下左右から除く幅（px）」で持つ。

// iPad（2048×2732）のスクリーンショットで実測した値
export const CROP_PRESETS = [
  {
    id: 'jump',
    label: 'ジャンプ',
    keywords: ['ジャンプ', 'jump'],
    crops: {
      portrait: {
        width: 2048,
        height: 2732,
        top: 0,
        right: 88,
        bottom: 0,
        left: 88
      },
      landscape: {
        width: 2732,
        height: 2048,
        top: 27,
        right: 0,
        bottom: 27,
        left: 0
      }
    }
  },
  {
    id: 'magazine',
    label: 'マガジン',
    keywords: ['マガジン', 'magazine'],
    crops: {
      portrait: {
        width: 2048,
        height: 2732,
        top: 64,
        right: 112,
        bottom: 50,
        left: 112
      },
      landscape: {
        width: 2732,
        height: 2048,
        top: 64,
        right: 18,
        bottom: 50,
        left: 18
      }
    }
  },
  {
    id: 'sunday',
    label: 'サンデー',
    keywords: ['サンデー', 'sunday'],
    crops: {
      portrait: {
        width: 2048,
        height: 2732,
        top: 0,
        right: 73,
        bottom: 0,
        left: 73
      },
      landscape: {
        width: 2732,
        height: 2048,
        top: 43,
        right: 0,
        bottom: 43,
        left: 0
      }
    }
  }
]

export function findCropPreset(name, slug) {
  const text =
    `${name || ''} ${slug || ''}`.toLowerCase()

  return (
    CROP_PRESETS.find((preset) =>
      preset.keywords.some((keyword) =>
        text.includes(keyword.toLowerCase())
      )
    ) || null
  )
}

// 1つ分の固定値を検査する。使えない値なら null。
export function normalizeCrop(value) {
  const numbers = {}

  for (const name of [
    'width',
    'height',
    'top',
    'right',
    'bottom',
    'left'
  ]) {
    const number = Number(value?.[name])

    if (
      !Number.isInteger(number) ||
      number < 0
    ) {
      return null
    }

    numbers[name] = number
  }

  // 切った後に半分も残らない値は、入力の誤りとみなす
  if (
    numbers.width < 16 ||
    numbers.height < 16 ||
    numbers.left + numbers.right >
      numbers.width / 2 ||
    numbers.top + numbers.bottom >
      numbers.height / 2
  ) {
    return null
  }

  return numbers
}

export function normalizeCrops(value) {
  const crops = {}

  for (const orientation of [
    'portrait',
    'landscape'
  ]) {
    const crop =
      normalizeCrop(value?.[orientation])

    if (crop) {
      crops[orientation] = crop
    }
  }

  return crops
}

// 画像の大きさに合う固定値から、残す範囲を求める。
// 固定値がない、または元画像の縦横比が違うとき（別の端末で撮ったなど）は null。
export function pickCropBox(
  crops,
  width,
  height
) {
  const crop =
    normalizeCrop(
      crops?.[
        width > height
          ? 'landscape'
          : 'portrait'
      ]
    )

  if (!crop || !width || !height) {
    return null
  }

  const scaleX = width / crop.width
  const scaleY = height / crop.height

  // 同じ縦横比なら、解像度が違っても同じ割合で切る
  if (
    Math.abs(scaleX - scaleY) >
    0.01 * Math.max(scaleX, scaleY)
  ) {
    return null
  }

  const x = Math.round(crop.left * scaleX)
  const y = Math.round(crop.top * scaleY)

  return {
    x,
    y,
    width:
      width -
      x -
      Math.round(crop.right * scaleX),
    height:
      height -
      y -
      Math.round(crop.bottom * scaleY)
  }
}

// ---- 雑誌の一覧（index.json） ----

export function normalizeRootIndex(data) {
  const seen = new Set()
  const magazines = []

  for (const item of data?.magazines || []) {
    const slug = normalizeSlug(item?.slug)

    if (!slug || seen.has(slug)) {
      continue
    }

    seen.add(slug)

    magazines.push({
      slug,
      name:
        String(item.name || '').trim() ||
        slug,
      crops: normalizeCrops(item.crops),
      years: Array.from(
        new Set(
          (item.years || [])
            .map(normalizeYear)
            .filter(Boolean)
        )
      ).sort((a, b) => b - a)
    })
  }

  return {
    version: 1,
    magazines
  }
}

export function upsertMagazine(
  root,
  { slug, name }
) {
  const next = normalizeRootIndex(root)
  const cleanSlug = normalizeSlug(slug)

  if (!cleanSlug) {
    return next
  }

  const cleanName =
    String(name || '').trim() || cleanSlug

  const existing =
    next.magazines.find(
      (magazine) =>
        magazine.slug === cleanSlug
    )

  if (existing) {
    existing.name = cleanName
  } else {
    next.magazines.push({
      slug: cleanSlug,
      name: cleanName,
      crops: {},
      years: []
    })
  }

  return next
}

export function setMagazineCrops(
  root,
  slug,
  crops
) {
  const next = normalizeRootIndex(root)

  const magazine =
    next.magazines.find(
      (item) => item.slug === slug
    )

  if (magazine) {
    magazine.crops = normalizeCrops(crops)
  }

  return next
}

export function addYearToMagazine(
  root,
  slug,
  year
) {
  const next = normalizeRootIndex(root)
  const cleanYear = normalizeYear(year)

  const magazine =
    next.magazines.find(
      (item) => item.slug === slug
    )

  if (
    magazine &&
    cleanYear &&
    !magazine.years.includes(cleanYear)
  ) {
    magazine.years =
      [...magazine.years, cleanYear].sort(
        (a, b) => b - a
      )
  }

  return next
}

// ---- 年ごとの索引（<雑誌>/<年>/index.json） ----

const MAX_SERIES_TAGS = 10
const MAX_SERIES_TITLE_LENGTH = 100

// 画像に付ける作品タグ。作品名そのものを記録する
// （端末ごとに作品の内部番号が違っても、同じ作品として扱えるように）。
export function normalizeSeriesTags(value) {
  const seen = new Set()
  const tags = []

  for (const item of Array.isArray(value)
    ? value
    : []) {
    const title =
      String(item ?? '')
        .trim()
        .slice(0, MAX_SERIES_TITLE_LENGTH)

    if (!title || seen.has(title)) {
      continue
    }

    seen.add(title)
    tags.push(title)

    if (tags.length >= MAX_SERIES_TAGS) {
      break
    }
  }

  return tags
}

function normalizeImage(image) {
  const file = String(image?.file || '')

  if (
    !/^[A-Za-z0-9._-]+\.jpg$/.test(file)
  ) {
    return null
  }

  return {
    file,
    seq: Number(image.seq) || 0,
    kind: normalizeKind(image.kind),
    width: Number(image.width) || 0,
    height: Number(image.height) || 0,
    bytes: Number(image.bytes) || 0,
    addedAt: String(image.addedAt || ''),
    series: normalizeSeriesTags(image.series)
  }
}

export function normalizeYearIndex(
  data,
  slug,
  year
) {
  const issues = {}

  for (const [folder, issue] of Object.entries(
    data?.issues || {}
  )) {
    if (!parseIssueFolder(folder)) {
      continue
    }

    const seen = new Set()

    const images =
      (issue?.images || [])
        .map(normalizeImage)
        .filter((image) => {
          if (
            !image ||
            seen.has(image.file)
          ) {
            return false
          }

          seen.add(image.file)
          return true
        })

    if (images.length > 0) {
      issues[folder] = {
        images,
        updatedAt:
          String(issue.updatedAt || '')
      }
    }
  }

  return {
    version: 1,
    slug,
    year,
    issues
  }
}

function updateIssue(
  index,
  folder,
  update,
  now
) {
  const next =
    normalizeYearIndex(
      index,
      index?.slug,
      index?.year
    )

  const images =
    update(
      next.issues[folder]?.images || []
    )

  if (images.length > 0) {
    next.issues[folder] = {
      images,
      updatedAt: now
    }
  } else {
    delete next.issues[folder]
  }

  return next
}

export function addImagesToIssue(
  index,
  folder,
  images,
  now = new Date().toISOString()
) {
  return updateIssue(
    index,
    folder,
    (current) => {
      const names =
        new Set(
          current.map((image) => image.file)
        )

      const added =
        images
          .map(normalizeImage)
          .filter((image) => {
            return (
              image &&
              !names.has(image.file)
            )
          })

      return [...current, ...added]
    },
    now
  )
}

export function removeImageFromIssue(
  index,
  folder,
  fileName,
  now = new Date().toISOString()
) {
  return updateIssue(
    index,
    folder,
    (current) => {
      return current.filter(
        (image) => image.file !== fileName
      )
    },
    now
  )
}

export function moveImageInIssue(
  index,
  folder,
  fileName,
  delta,
  now = new Date().toISOString()
) {
  return updateIssue(
    index,
    folder,
    (current) => {
      const from =
        current.findIndex(
          (image) => image.file === fileName
        )

      const to = from + delta

      if (
        from < 0 ||
        to < 0 ||
        to >= current.length
      ) {
        return current
      }

      const next = [...current]
      const [moved] = next.splice(from, 1)

      next.splice(to, 0, moved)
      return next
    },
    now
  )
}

export function setImageKindInIssue(
  index,
  folder,
  fileName,
  kindId,
  now = new Date().toISOString()
) {
  return updateIssue(
    index,
    folder,
    (current) => {
      return current.map((image) => {
        return image.file === fileName
          ? {
              ...image,
              kind: normalizeKind(kindId)
            }
          : image
      })
    },
    now
  )
}

export function setImageSeriesInIssue(
  index,
  folder,
  fileName,
  series,
  now = new Date().toISOString()
) {
  return updateIssue(
    index,
    folder,
    (current) => {
      return current.map((image) => {
        return image.file === fileName
          ? {
              ...image,
              series:
                normalizeSeriesTags(series)
            }
          : image
      })
    },
    now
  )
}

// ---- 見開きと、その各ページの対応 ----
//
// 見開きは、見開き1枚に加えて各ページを縦で撮ることがある（撮らないこともある）。
// 並び順だけでは見分けられないので、画像の中身で判定する。
// 画像を小さく縮めた明るさの並び（署名）同士の差が小さければ、同じ絵とみなす。
// 署名は prepareImage.js で作る。縦の画像は page、見開きは left・right を持つ。

// 実際のスクリーンショットで、同じ絵（位置のずれ3%まで）は差15以下、
// 別の絵は差34以上だったので、その間に置く。
export const PAGE_MATCH_THRESHOLD = 22

const MAX_PAGES_PER_SPREAD = 2

export function signatureDistance(a, b) {
  if (
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    a.length === 0 ||
    a.length !== b.length
  ) {
    return Infinity
  }

  let total = 0

  for (let i = 0; i < a.length; i += 1) {
    total += Math.abs(a[i] - b[i])
  }

  return total / a.length
}

// 縦の画像ごとに、どの見開きのページか（なければ含めない）を返す。
// items: { id, width, height, signature }
export function matchSpreadPages(items) {
  const spreads =
    items.filter(
      (item) =>
        isSpreadSize(item) &&
        item.signature?.left &&
        item.signature?.right
    )

  const candidates = []

  for (const item of items) {
    if (
      isSpreadSize(item) ||
      !item.signature?.page
    ) {
      continue
    }

    let best = null

    for (const spread of spreads) {
      const distance =
        Math.min(
          signatureDistance(
            item.signature.page,
            spread.signature.left
          ),
          signatureDistance(
            item.signature.page,
            spread.signature.right
          )
        )

      if (
        distance < PAGE_MATCH_THRESHOLD &&
        (!best || distance < best.distance)
      ) {
        best = {
          pageId: item.id,
          spreadId: spread.id,
          distance
        }
      }
    }

    if (best) {
      candidates.push(best)
    }
  }

  // 1つの見開きにつくページは2枚まで（よく似たものから）
  candidates.sort(
    (a, b) => a.distance - b.distance
  )

  const counts = new Map()
  const pages = new Map()

  for (const candidate of candidates) {
    const count =
      counts.get(candidate.spreadId) || 0

    if (count >= MAX_PAGES_PER_SPREAD) {
      continue
    }

    counts.set(candidate.spreadId, count + 1)
    pages.set(
      candidate.pageId,
      candidate.spreadId
    )
  }

  return pages
}

// まとめて取り込むときの種類の初期値。撮った順に、
// 1. 最初の縦（見開きのページを除く）を表紙（その号にまだ表紙がなければ）
// 2. 表紙のあと最初の見開きまでの縦（扉。ない号もある）と、その見開き、
//    その見開きのページを巻頭カラー（その号にまだ巻頭カラーがなければ）
// 3. それ以外をセンターカラー
// とする。見開きのページかどうかは spreadId（matchSpreadPages の結果）で見る。
// 登録前に画面で直せる。
export function suggestKinds(
  items,
  {
    hasCover = false,
    hasOpening = false
  } = {}
) {
  const kinds = items.map(() => 'center')

  const isPage = (item) =>
    Boolean(item.spreadId)

  let coverIndex = -1

  if (!hasCover) {
    coverIndex =
      items.findIndex(
        (item) =>
          !isSpreadSize(item) &&
          !isPage(item)
      )

    if (coverIndex >= 0) {
      kinds[coverIndex] = 'cover'
    }
  }

  if (!hasOpening) {
    const spreadIndex =
      items.findIndex(
        (item, index) =>
          index > coverIndex &&
          isSpreadSize(item)
      )

    if (spreadIndex >= 0) {
      const spreadId = items[spreadIndex].id

      items.forEach((item, index) => {
        const isOwnPage =
          item.spreadId === spreadId

        const isTitlePage =
          index > coverIndex &&
          index < spreadIndex &&
          !isPage(item)

        if (
          index === spreadIndex ||
          isOwnPage ||
          isTitlePage
        ) {
          kinds[index] = 'opening'
        }
      })
    }
  }

  return kinds
}

// 同じ作品のカラーとしてまとまる画像の組。
// ・見開きと、そのページ（spreadId が同じもの）は1組
// ・続いている巻頭カラーは1組
// ・それ以外は1枚ずつ
// 返り値は、画像ごとの組の番号（先に出てきた組から0, 1, 2…）。
export function groupColorPieces(items) {
  const parent = items.map((_, index) => index)

  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]]
      index = parent[index]
    }

    return index
  }

  const join = (a, b) => {
    const rootA = find(a)
    const rootB = find(b)

    if (rootA !== rootB) {
      parent[Math.max(rootA, rootB)] =
        Math.min(rootA, rootB)
    }
  }

  const indexById = new Map(
    items.map((item, index) => [
      item.id,
      index
    ])
  )

  items.forEach((item, index) => {
    if (
      item.spreadId &&
      indexById.has(item.spreadId)
    ) {
      join(index, indexById.get(item.spreadId))
    }

    if (
      index > 0 &&
      normalizeKind(item.kind) === 'opening' &&
      normalizeKind(items[index - 1].kind) ===
        'opening'
    ) {
      join(index, index - 1)
    }
  })

  const numbers = new Map()

  return items.map((_, index) => {
    const root = find(index)

    if (!numbers.has(root)) {
      numbers.set(root, numbers.size)
    }

    return numbers.get(root)
  })
}

// 複数の年の索引を、新しい号から順にたどる
function walkImages(yearIndexes, visit) {
  const sorted =
    [...yearIndexes].sort(
      (a, b) => b.year - a.year
    )

  for (const index of sorted) {
    const folders =
      Object.keys(index.issues || {}).sort(
        (a, b) => compareIssueFolders(b, a)
      )

    for (const folder of folders) {
      for (const image of index.issues[folder]
        .images) {
        visit(image, index.year, folder)
      }
    }
  }
}

// タグの付いた作品の一覧（枚数と、いちばん新しい1枚）
export function collectSeries(yearIndexes) {
  const found = new Map()

  walkImages(
    yearIndexes,
    (image, year, folder) => {
      for (const title of image.series) {
        const entry = found.get(title)

        if (entry) {
          entry.count += 1
        } else {
          found.set(title, {
            title,
            count: 1,
            cover: {
              year,
              folder,
              file: image.file
            }
          })
        }
      }
    }
  )

  return Array.from(found.values()).sort(
    (a, b) =>
      a.title.localeCompare(b.title, 'ja')
  )
}

// ある作品のタグが付いた画像を、新しい号から順に並べる
export function listSeriesImages(
  yearIndexes,
  title
) {
  const images = []

  walkImages(
    yearIndexes,
    (image, year, folder) => {
      if (image.series.includes(title)) {
        images.push({
          ...image,
          year,
          folder
        })
      }
    }
  )

  return images
}

// 作品ごとの画像の並べ順
export const SERIES_IMAGE_SORTS = [
  { id: 'new', label: '新しい順' },
  { id: 'old', label: '古い順' },
  { id: 'opening', label: '巻頭カラーが先' },
  { id: 'center', label: 'センターカラーが先' }
]

// listSeriesImages の結果（新しい号から順）を並べ替える。
// 同じ号の中は、号の画面と同じ順のまま。
// 巻頭・センターが先の並びでは、その種類を先に、それぞれ新しい号から並べる。
export function arrangeSeriesImages(
  images,
  sort = 'new'
) {
  const withOrder =
    images.map((image, order) => ({
      image,
      order,
      serial:
        image.year * 100 +
        (parseIssueFolder(image.folder)?.start ||
          0)
    }))

  if (sort === 'old') {
    withOrder.sort(
      (a, b) =>
        a.serial - b.serial || a.order - b.order
    )
  } else if (
    sort === 'opening' ||
    sort === 'center'
  ) {
    const rank = (entry) =>
      normalizeKind(entry.image.kind) === sort
        ? 0
        : 1

    withOrder.sort(
      (a, b) =>
        rank(a) - rank(b) || a.order - b.order
    )
  }

  return withOrder.map((entry) => entry.image)
}

export function listIssues(index) {
  return Object.keys(index?.issues || {})
    .sort(compareIssueFolders)
    .map((folder) => {
      return {
        folder,
        images: index.issues[folder].images
      }
    })
}
