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

export const IMAGE_KINDS = [
  { id: 'cover', label: '表紙' },
  { id: 'spread', label: '見開き' },
  { id: 'center', label: 'センターカラー' },
  { id: 'other', label: 'その他' }
]

const KIND_IDS =
  new Set(IMAGE_KINDS.map((kind) => kind.id))

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
  return KIND_IDS.has(kindId)
    ? kindId
    : 'other'
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
      years: []
    })
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
    addedAt: String(image.addedAt || '')
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
