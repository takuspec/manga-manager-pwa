import { useState } from 'react'
import { createPortal } from 'react-dom'
import { normalizeSeriesTags } from '../utils/colorLibrary'
import { PINNED_TAGS } from '../utils/colorCatalog'

const MAX_VISIBLE_CHOICES = 60

// 画像に付ける作品を選ぶ画面。
// 候補はアプリに登録済みの作品名。候補にない名前も、入力して追加できる。
// featured（その号に載っていた作品）は、絞り込んでいないときに先頭へまとめて出す。
// 読み切りは作品名ごとに分けず、「読み切り」1つのタグにまとめる（いつも先頭に出す）。
function SeriesTagPicker({
  choices,
  featured = [],
  value,
  onDone,
  onCancel
}) {
  const selected = normalizeSeriesTags(value)

  const [query, setQuery] = useState('')

  // この号に載っている作品が分かるときは、それだけを出す。
  // ほかの作品は、ボタンを押したときだけ出す。
  const [showAll, setShowAll] =
    useState(featured.length === 0)

  const keyword = query.trim()

  const featuredSet = new Set(featured)

  const allChoices =
    Array.from(
      new Set([...featured, ...choices])
    )

  const showFeatured =
    !keyword && featured.length > 0

  const searchable = [
    ...PINNED_TAGS,
    ...(showAll ? allChoices : featured)
  ]

  const matches =
    keyword
      ? searchable.filter((title) =>
          title
            .toLowerCase()
            .includes(keyword.toLowerCase())
        )
      : !showAll
        ? []
        : showFeatured
          ? choices.filter(
              (title) => !featuredSet.has(title)
            )
          : choices

  const visible =
    matches.slice(0, MAX_VISIBLE_CHOICES)


  const renderItem = (title) => (
    <button
      key={title}
      type="button"
      className={
        selected.includes(title)
          ? 'series-picker-item selected'
          : 'series-picker-item'
      }
      aria-pressed={selected.includes(title)}
      onClick={() => toggle(title)}
    >
      {title}
    </button>
  )

  // 押したらすぐ決まる。付いていない作品を押すと追加、付いている作品を押すと外す。
  // 2つ目を付けるときは、もう一度開いて押す。
  const toggle = (title) => {
    onDone(
      selected.includes(title)
        ? selected.filter(
            (item) => item !== title
          )
        : normalizeSeriesTags([
            ...selected,
            title
          ])
    )
  }

  return createPortal(
    <div
      className="series-picker"
      role="dialog"
      aria-modal="true"
      aria-label="作品タグを選ぶ"
    >
      <div className="series-picker-panel">
        <div className="series-picker-header">
          <button
            type="button"
            className="cloud-settings-secondary"
            onClick={onCancel}
          >
            やめる
          </button>

          <strong>作品タグ</strong>

          <span aria-hidden="true" />
        </div>

        {selected.length > 0 && (
          <div className="color-chip-row">
            {selected.map((title) => (
              <button
                key={title}
                type="button"
                className="color-chip selected"
                aria-label={`${title} を外す`}
                onClick={() => toggle(title)}
              >
                {title} ×
              </button>
            ))}
          </div>
        )}

        <input
          type="search"
          className="series-picker-search"
          placeholder="作品名で絞り込む"
          aria-label="作品名で絞り込む"
          value={query}
          onChange={(event) =>
            setQuery(event.target.value)
          }
        />

        <div className="series-picker-list">
          {!keyword && !showFeatured && (
            <>
              <h3 className="series-picker-heading">
                読み切り・合併号
              </h3>
              {PINNED_TAGS.map(renderItem)}
            </>
          )}

          {showFeatured && (
            <>
              <h3 className="series-picker-heading">
                この号に載っている作品（
                {featured.length}）
              </h3>
              {/* 読み切り・合併号は、この号の作品の先頭にいつも出す */}
              {PINNED_TAGS.map(renderItem)}
              {featured.map(renderItem)}
              {showAll && (
                <h3 className="series-picker-heading">
                  ほかの作品
                </h3>
              )}
            </>
          )}

          {visible.map(renderItem)}

          {!showAll && (
            <button
              type="button"
              className="cloud-settings-secondary"
              onClick={() => setShowAll(true)}
            >
              ほかの作品からも選ぶ
            </button>
          )}

          {matches.length >
            visible.length && (
            <p className="cloud-settings-note">
              ほか{' '}
              {matches.length -
                visible.length}{' '}
              件。作品名で絞り込んでください。
            </p>
          )}

          {matches.length === 0 &&
            !showFeatured &&
            showAll && (
              <p className="cloud-settings-note">
                該当する作品がありません。
              </p>
            )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default SeriesTagPicker
