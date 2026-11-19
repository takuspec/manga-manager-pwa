import { useEffect, useRef, useState } from 'react'
import {
  useParams,
  useSearchParams
} from 'react-router-dom'
import {
  useGoBack,
  useScrollTopOnOpen
} from '../hooks/useScrollHeader'
import SeriesTagPicker from '../components/SeriesTagPicker'
import prepareImage from '../utils/prepareImage'
import uploadQueue from '../utils/uploadQueue'
import {
  AI_MAX_IMAGES,
  analyzePages
} from '../utils/colorAi'
import {
  buildIssueSequence,
  collectCandidates,
  groupByStarts,
  nextIssues,
  refineKindsBySeries,
  sortByShotOrder,
  unifySpreadSeries
} from '../utils/colorBulk'
import { PINNED_TAGS } from '../utils/colorCatalog'
import {
  findAppMagazine,
  getCatalogRange,
  listSeriesInIssue
} from '../utils/colorCatalog'
import {
  getCachedRootIndex,
  loadRootIndex
} from '../utils/colorStore'
import {
  IMAGE_KINDS,
  formatIssueFolder,
  isSpreadSize,
  issueFolder,
  matchSpreadPages,
  normalizeSlug,
  normalizeYear,
  parseIssueFolder,
  suggestKinds
} from '../utils/colorLibrary'

const PAGE_TYPE_LABELS = {
  cover: '表紙',
  toc: '目次',
  color: 'カラー',
  other: 'そのほか'
}

// 作品タグの候補。この雑誌の作品を先に、ほかの雑誌の作品を後ろに並べる
function buildSeriesChoices(
  seriesList,
  localMagazineId
) {
  const byTitle = (a, b) =>
    a.localeCompare(b, 'ja')

  const titlesOf = (list) =>
    list
      .map((series) =>
        String(series.title || '').trim()
      )
      .filter(Boolean)
      .sort(byTitle)

  return Array.from(
    new Set([
      ...titlesOf(
        seriesList.filter(
          (series) =>
            series.magazineId ===
            localMagazineId
        )
      ),
      ...titlesOf(
        seriesList.filter(
          (series) =>
            series.magazineId !==
            localMagazineId
        )
      )
    ])
  )
}

// 号ごとに、種類を付け直す（手で変えたものはそのまま）
function applyKinds(items) {
  const starts = items.map((item) => item.start)
  const next = items.map((item) => ({ ...item }))

  for (const group of groupByStarts(starts)) {
    const kept =
      group.filter((index) => !next[index].skip)

    const kinds =
      suggestKinds(
        kept.map((index) => ({
          id: next[index].id,
          spreadId: next[index].spreadId,
          width: next[index].prepared.width,
          height: next[index].prepared.height
        }))
      )

    // 表紙の作品と同じなら巻頭カラー、違えばセンターカラー
    const refined =
      refineKindsBySeries(
        kept.map((index, position) => ({
          id: next[index].id,
          spreadId: next[index].spreadId,
          series: next[index].series,
          kind:
            next[index].type === 'cover'
              ? 'cover'
              : kinds[position]
        }))
      )

    kept.forEach((index, position) => {
      const item = next[index]

      if (item.kindTouched) {
        return
      }

      item.kind = refined[position]
    })
  }

  return next
}

function ColorBulkPage({
  seriesList,
  magazineList
}) {
  const params = useParams()
  const [searchParams] = useSearchParams()

  useScrollTopOnOpen()

  const slug = normalizeSlug(params.slug)
  const startYear =
    normalizeYear(searchParams.get('y'))
  const startFolder =
    parseIssueFolder(searchParams.get('i'))
      ? searchParams.get('i')
      : ''

  const isValid = Boolean(
    slug && startYear && startFolder
  )

  const goBack =
    useGoBack(
      isValid
        ? `/color/${slug}/${startYear}/${startFolder}`
        : '/color'
    )

  const [rootReady, setRootReady] =
    useState(Boolean(getCachedRootIndex()))
  const [direction, setDirection] =
    useState(-1)
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState('')
  const [message, setMessage] =
    useState(null)
  const [tagTarget, setTagTarget] =
    useState(null)

  const previewUrlsRef = useRef([])
  const batchRef = useRef(0)

  const releasePreviews = () => {
    previewUrlsRef.current.forEach((url) =>
      URL.revokeObjectURL(url)
    )
    previewUrlsRef.current = []
  }

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) =>
        URL.revokeObjectURL(url)
      )
      previewUrlsRef.current = []
    }
  }, [])

  useEffect(() => {
    if (rootReady) {
      return
    }

    loadRootIndex()
      .then(() => setRootReady(true))
      .catch((error) => {
        console.error(error)
        setRootReady(true)
      })
  }, [rootReady])

  const colorMagazine =
    getCachedRootIndex()?.magazines.find(
      (magazine) => magazine.slug === slug
    )

  const appMagazine =
    findAppMagazine(
      colorMagazine,
      magazineList
    )

  const range =
    getCatalogRange(
      colorMagazine,
      appMagazine
    )

  const sequence =
    buildIssueSequence(appMagazine, range)

  const start = {
    year: startYear,
    folder: startFolder
  }

  const groups =
    groupByStarts(
      items.map((item) => item.start)
    )

  const defaults =
    nextIssues(
      sequence,
      start,
      direction,
      Math.max(groups.length, 1)
    )

  const issueOf = (groupIndex) => {
    const first = items[groups[groupIndex][0]]

    return first?.issue || defaults[groupIndex]
  }

  const groupOfItem = new Map()

  groups.forEach((group, groupIndex) => {
    group.forEach((index) =>
      groupOfItem.set(items[index].id, groupIndex)
    )
  })

  const handleFiles = async (event) => {
    // 撮った順に並べ直す（選んだ順が撮った順と違うことがあるため）
    const files =
      sortByShotOrder(event.target.files || [])

    event.target.value = ''

    if (files.length === 0) {
      return
    }

    if (files.length > AI_MAX_IMAGES) {
      setMessage({
        type: 'error',
        text: `一度に選べるのは ${AI_MAX_IMAGES} 枚までです。`
      })
      return
    }

    setMessage(null)

    try {
      const crops = colorMagazine?.crops
      const prepared = []

      for (const file of files) {
        setBusy(
          `準備中 ${prepared.length + 1} / ${files.length}`
        )
        prepared.push(
          await prepareImage(file, {
            trim: true,
            crops
          })
        )
      }

      batchRef.current += 1
      const stamp = batchRef.current

      const analyzed =
        prepared.map((item, position) => ({
          id: `${stamp}-${position}`,
          width: item.width,
          height: item.height,
          signature: item.signature
        }))

      const pages = matchSpreadPages(analyzed)

      // 号ごとの作品の候補（号の番号が1つずれても当たるよう、前後の号も含める）
      const guessIssues =
        nextIssues(
          sequence,
          start,
          direction,
          files.length + 2
        )

      const fallbackChoices =
        buildSeriesChoices(
          seriesList,
          appMagazine?.id
        ).slice(0, 250)

      const candidatesFor = (groupIndex) => {
        const titles =
          collectCandidates(
            seriesList,
            appMagazine,
            [
              guessIssues[groupIndex - 1],
              guessIssues[groupIndex],
              guessIssues[groupIndex + 1]
            ]
          )

        return titles.length > PINNED_TAGS.length
          ? titles
          : [...PINNED_TAGS, ...fallbackChoices]
      }

      setBusy('AI が判定中…')

      const result =
        await analyzePages({
          images: prepared,
          splitByCovers: true,
          candidatesFor,
          onProgress: (done, total) =>
            setBusy(
              `AI が判定中 ${done} / ${total}`
            )
        })

      const starts = result.starts

      releasePreviews()

      let next =
        prepared.map((item, position) => {
          const previewUrl =
            URL.createObjectURL(item.thumb)

          previewUrlsRef.current.push(previewUrl)

          const type =
            result.types[position] || 'color'

          const series =
            result.series[position] || []

          return {
            id: analyzed[position].id,
            spreadId:
              pages.get(analyzed[position].id) ||
              null,
            prepared: item,
            previewUrl,
            type,
            skip: type === 'toc',
            start: starts[position],
            issue: null,
            kind: 'center',
            kindTouched: false,
            series,
            autoSeries: series.length > 0
          }
        })

      // 見開きと各ページは、同じ作品にそろえる
      const unified = unifySpreadSeries(next)

      next = next.map((item, position) => ({
        ...item,
        series: unified[position],
        autoSeries: unified[position].length > 0
      }))

      setItems(applyKinds(next))

      if (result.error) {
        setMessage({
          type: 'error',
          text: result.error
        })
      }
    } catch (error) {
      console.error(error)
      setMessage({
        type: 'error',
        text: '画像を読み込めませんでした。別の画像で試してください。'
      })
    } finally {
      setBusy('')
    }
  }

  const updateItem = (id, patch, rekind) => {
    setItems((current) => {
      const next =
        current.map((item) =>
          item.id === id
            ? { ...item, ...patch }
            : item
        )

      return rekind ? applyKinds(next) : next
    })
  }

  const removeItem = (id) => {
    setItems((current) => {
      const position =
        current.findIndex(
          (item) => item.id === id
        )

      const next =
        current.filter((item) => item.id !== id)

      // 号の先頭を消したら、次の画像を先頭にする
      if (
        position >= 0 &&
        current[position].start &&
        next[position]
      ) {
        next[position] = {
          ...next[position],
          start: true,
          issue:
            next[position].issue ||
            current[position].issue
        }
      }

      if (next.length > 0) {
        next[0] = { ...next[0], start: true }
      }

      return applyKinds(next)
    })
  }

  const setGroupIssue = (groupIndex, issue) => {
    const first = items[groups[groupIndex][0]]

    updateItem(first.id, { issue })
  }

  const handleTagsDone = (series) => {
    const target = tagTarget

    setTagTarget(null)

    setItems((current) =>
      applyKinds(
        current.map((item) =>
          item.id === target.id ||
          (item.spreadId === target.id &&
            item.series.length === 0)
            ? {
                ...item,
                series,
                autoSeries: false
              }
            : item
        )
      )
    )
  }

  const handleRegister = async () => {
    setMessage(null)

    const targets =
      groups.map((_, groupIndex) =>
        issueOf(groupIndex)
      )

    if (targets.some((issue) => !issue)) {
      setMessage({
        type: 'error',
        text: '号が決まっていない組があります。号を選んでください。'
      })
      return
    }

    const keys =
      targets.map(
        (issue) =>
          `${issue.year}/${issue.folder}`
      )

    if (new Set(keys).size !== keys.length) {
      setMessage({
        type: 'error',
        text: '同じ号が2回出てきます。号を選び直してください。'
      })
      return
    }

    try {
      let count = 0

      for (const [
        groupIndex,
        group
      ] of groups.entries()) {
        const list =
          group
            .map((index) => items[index])
            .filter((item) => !item.skip)

        if (list.length === 0) {
          continue
        }

        const issue = targets[groupIndex]

        await uploadQueue.enqueue({
          slug,
          year: issue.year,
          folder: issue.folder,
          items: list.map((item) => {
            const spreadPosition =
              item.spreadId
                ? list.findIndex(
                    (other) =>
                      other.id === item.spreadId
                  )
                : -1

            return {
              ...item.prepared,
              kind: item.kind,
              series: item.series,
              pageOf:
                spreadPosition >= 0
                  ? spreadPosition
                  : null
            }
          })
        })

        count += 1
      }

      releasePreviews()
      setItems([])
      setMessage({
        type: 'ok',
        text: `${count} 号分の送信を始めました。終わるのを待たずに、続けて次を選べます。`
      })
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error?.message ||
          '登録できませんでした。'
      })
    }
  }

  const tagItem =
    tagTarget &&
    items.find((item) => item.id === tagTarget.id)

  const tagIssue =
    tagItem
      ? issueOf(groupOfItem.get(tagItem.id))
      : null

  return (
    <div className="app">
      <div className="series-page-header">
        <button
          className="back-button"
          onClick={goBack}
        >
          ← 戻る
        </button>

        <div className="title series-page-title">
          何号分もまとめて追加
        </div>

        <div />
      </div>

      {!isValid && (
        <div className="color-notice error">
          <p>ページが見つかりません。</p>
        </div>
      )}

      {isValid && (
        <div className="color-page">
          <section className="cloud-settings-section">
            <p className="cloud-settings-note">
              何号分かの画像を、撮った順のまま一度に選んでください（{AI_MAX_IMAGES}枚まで）。AI が表紙ごとに号を区切り、作品タグを付けます。目次の画像（各号の最後）は判定の参考にして、保存はしません。1枚ずつ判定するので、少し時間がかかります。
            </p>

            <label className="color-toolbar-field">
              <span>
                最初の号は {startYear}年{' '}
                {formatIssueFolder(startFolder)}。続きの号は
              </span>
              <select
                value={direction}
                disabled={Boolean(busy)}
                onChange={(event) =>
                  setDirection(
                    Number(event.target.value)
                  )
                }
              >
                <option value={-1}>
                  古い号へ進む（50号 → 49号…）
                </option>
                <option value={1}>
                  新しい号へ進む（50号 → 51号…）
                </option>
              </select>
            </label>

            {items.length === 0 && (
              <label
                className={
                  busy || !rootReady
                    ? 'image-size-test-pick disabled'
                    : 'image-size-test-pick'
                }
              >
                {busy || '画像をまとめて選ぶ'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={
                    Boolean(busy) || !rootReady
                  }
                  onChange={handleFiles}
                />
              </label>
            )}
          </section>

          {message && (
            <div
              className={
                message.type === 'error'
                  ? 'cloud-settings-message error'
                  : 'cloud-settings-message'
              }
              role="status"
            >
              {message.text}
            </div>
          )}

          {groups.map((group, groupIndex) => {
            const issue = issueOf(groupIndex)

            return (
              <section
                key={items[group[0]].id}
                className="cloud-settings-section color-bulk-group"
              >
                <h2>
                  {groupIndex + 1}号目：
                  {issue
                    ? `${issue.year}年 ${formatIssueFolder(
                        issue.folder
                      )}`
                    : '号を選んでください'}
                </h2>

                {sequence.length > 0 ? (
                  <select
                    aria-label="登録する号"
                    value={
                      issue
                        ? `${issue.year}/${issue.folder}`
                        : ''
                    }
                    onChange={(event) => {
                      const [year, folder] =
                        event.target.value.split('/')

                      setGroupIssue(groupIndex, {
                        year: Number(year),
                        folder
                      })
                    }}
                  >
                    {!issue && (
                      <option value="">
                        号を選ぶ
                      </option>
                    )}
                    {sequence
                      .slice()
                      .reverse()
                      .map((item) => (
                        <option
                          key={`${item.year}/${item.folder}`}
                          value={`${item.year}/${item.folder}`}
                        >
                          {item.year}年{' '}
                          {formatIssueFolder(
                            item.folder
                          )}
                        </option>
                      ))}
                  </select>
                ) : (
                  <div className="color-bulk-issue-inputs">
                    <input
                      type="number"
                      inputMode="numeric"
                      aria-label="年"
                      value={issue?.year || ''}
                      onChange={(event) =>
                        setGroupIssue(groupIndex, {
                          year:
                            Number(
                              event.target.value
                            ) || startYear,
                          folder:
                            issue?.folder ||
                            startFolder
                        })
                      }
                    />
                    <span>年</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      aria-label="号"
                      value={
                        parseIssueFolder(
                          issue?.folder
                        )?.start || ''
                      }
                      onChange={(event) => {
                        const number =
                          Number(event.target.value)

                        if (
                          number >= 1 &&
                          number <= 99
                        ) {
                          setGroupIssue(groupIndex, {
                            year:
                              issue?.year ||
                              startYear,
                            folder: issueFolder({
                              start: number,
                              end: null
                            })
                          })
                        }
                      }}
                    />
                    <span>号</span>
                  </div>
                )}

                <div className="color-pending-list">
                  {group.map((index) => {
                    const item = items[index]

                    return (
                      <div
                        key={item.id}
                        className={
                          item.skip
                            ? 'color-pending-item skipped'
                            : 'color-pending-item'
                        }
                      >
                        <div className="color-thumb">
                          <img
                            src={item.previewUrl}
                            alt=""
                          />
                        </div>

                        <div className="color-pending-fields">
                          <small>
                            AI の判定：
                            {PAGE_TYPE_LABELS[item.type] ||
                              'カラー'}
                            {isSpreadSize(item.prepared)
                              ? '・見開き'
                              : item.spreadId
                                ? '・見開きのページ'
                                : ''}
                          </small>

                          {item.skip ? (
                            <button
                              type="button"
                              className="cloud-settings-secondary"
                              onClick={() =>
                                updateItem(
                                  item.id,
                                  { skip: false },
                                  true
                                )
                              }
                            >
                              目次なので保存しない（押すと保存する）
                            </button>
                          ) : (
                            <>
                              <select
                                aria-label="種類"
                                value={item.kind}
                                onChange={(event) =>
                                  updateItem(item.id, {
                                    kind: event.target
                                      .value,
                                    kindTouched: true
                                  })
                                }
                              >
                                {IMAGE_KINDS.map(
                                  (kind) => (
                                    <option
                                      key={kind.id}
                                      value={kind.id}
                                    >
                                      {kind.label}
                                    </option>
                                  )
                                )}
                              </select>

                              <button
                                type="button"
                                className={
                                  item.autoSeries
                                    ? 'cloud-settings-secondary color-auto-tag'
                                    : 'cloud-settings-secondary'
                                }
                                onClick={() => {
                                  // 自動で付いたタグは、押すと消して選び直す
                                  if (item.autoSeries) {
                                    updateItem(item.id, {
                                      series: [],
                                      autoSeries: false
                                    })
                                  }

                                  setTagTarget({
                                    id: item.id
                                  })
                                }}
                              >
                                {item.series.length > 0
                                  ? `${
                                      item.autoSeries
                                        ? '自動：'
                                        : ''
                                    }${item.series.join('、')}`
                                  : '作品タグを付ける'}
                              </button>
                            </>
                          )}

                          <div className="color-edit-row">
                            {index > 0 && (
                              <button
                                type="button"
                                className={
                                  item.start
                                    ? 'color-bulk-split on'
                                    : 'color-bulk-split'
                                }
                                aria-pressed={item.start}
                                onClick={() =>
                                  updateItem(
                                    item.id,
                                    {
                                      start: !item.start,
                                      issue: null
                                    },
                                    true
                                  )
                                }
                              >
                                {item.start
                                  ? 'ここから次の号（解除）'
                                  : 'ここから次の号'}
                              </button>
                            )}

                            <button
                              type="button"
                              className="color-delete"
                              onClick={() =>
                                removeItem(item.id)
                              }
                            >
                              外す
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}

          {items.length > 0 && (
            <div className="color-bulk-actions">
              <button
                type="button"
                className="cloud-settings-secondary"
                onClick={() => {
                  releasePreviews()
                  setItems([])
                  setMessage(null)
                }}
              >
                やめる
              </button>

              <button
                type="button"
                onClick={handleRegister}
              >
                {groups.length} 号分を登録
              </button>
            </div>
          )}
        </div>
      )}

      {tagItem && (
        <SeriesTagPicker
          choices={buildSeriesChoices(
            seriesList,
            appMagazine?.id
          )}
          featured={
            tagIssue
              ? listSeriesInIssue(
                  seriesList,
                  appMagazine,
                  tagIssue.year,
                  tagIssue.folder
                )
              : []
          }
          value={tagItem.series}
          onDone={handleTagsDone}
          onCancel={() => setTagTarget(null)}
        />
      )}
    </div>
  )
}

export default ColorBulkPage
