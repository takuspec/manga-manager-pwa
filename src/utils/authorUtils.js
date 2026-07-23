export function normalizeAuthorSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‐‑‒–—―ーｰ]/g, '-')
    .replace(/[〜～]/g, '~')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getSeriesAuthorEntries(series) {
  return [
    {
      role: '',
      name: series.author
    },
    {
      role: '原作',
      name: series.storyAuthor
    },
    {
      role: '作画',
      name: series.artAuthor
    },
    {
      role: '脚本',
      name: series.scriptAuthor
    }
  ]
    .map((entry) => ({
      ...entry,
      name: String(entry.name || '').trim()
    }))
    .filter((entry) => entry.name)
}

export function getSeriesAuthorNames(series) {
  const seen = new Set()

  return getSeriesAuthorEntries(series)
    .map((entry) => entry.name)
    .filter((name) => {
      const key = normalizeAuthorSearchText(name)

      if (!key || seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    })
}

export function getUniqueSeriesAuthorEntries(series) {
  const seen = new Set()

  return getSeriesAuthorEntries(series)
    .filter((entry) => {
      const key = normalizeAuthorSearchText(entry.name)

      if (!key || seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    })
}

export function formatSeriesAuthorEntries(series) {
  const entries = getSeriesAuthorEntries(series)

  if (!entries.length) {
    return ''
  }

  const hasSplitCredit =
    entries.some((entry) => entry.role)

  return entries
    .map((entry) => {
      if (!hasSplitCredit || !entry.role) {
        return entry.name
      }

      return `${entry.role}: ${entry.name}`
    })
    .join(' / ')
}

export function buildAuthorSearchParam(series) {
  return getSeriesAuthorNames(series).join('|')
}

export function seriesMatchesAuthorParam(series, authorParam) {
  const targetNames = String(authorParam || '')
    .split('|')
    .map(normalizeAuthorSearchText)
    .filter(Boolean)

  if (!targetNames.length) {
    return false
  }

  const seriesNames = getSeriesAuthorNames(series)
    .map(normalizeAuthorSearchText)

  return targetNames.some((targetName) =>
    seriesNames.includes(targetName)
  )
}
