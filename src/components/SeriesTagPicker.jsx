import { useState } from 'react'
import { createPortal } from 'react-dom'
import { normalizeSeriesTags } from '../utils/colorLibrary'

const MAX_VISIBLE_CHOICES = 60

// 画像に付ける作品を選ぶ画面。
// 候補はアプリに登録済みの作品名。候補にない名前も、入力して追加できる。
function SeriesTagPicker({
  choices,
  value,
  onDone,
  onCancel
}) {
  const [selected, setSelected] =
    useState(() =>
      normalizeSeriesTags(value)
    )

  const [query, setQuery] = useState('')

  const keyword = query.trim()

  const matches =
    keyword
      ? choices.filter((title) =>
          title
            .toLowerCase()
            .includes(keyword.toLowerCase())
        )
      : choices

  const visible =
    matches.slice(0, MAX_VISIBLE_CHOICES)

  const canAddTyped =
    Boolean(keyword) &&
    !choices.includes(keyword) &&
    !selected.includes(keyword)

  const toggle = (title) => {
    setSelected((current) => {
      return current.includes(title)
        ? current.filter(
            (item) => item !== title
          )
        : normalizeSeriesTags([
            ...current,
            title
          ])
    })
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

          <button
            type="button"
            onClick={() => onDone(selected)}
          >
            決定
          </button>
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
          {canAddTyped && (
            <button
              type="button"
              className="series-picker-item"
              onClick={() => {
                toggle(keyword)
                setQuery('')
              }}
            >
              「{keyword}」を追加
            </button>
          )}

          {visible.map((title) => (
            <button
              key={title}
              type="button"
              className={
                selected.includes(title)
                  ? 'series-picker-item selected'
                  : 'series-picker-item'
              }
              aria-pressed={selected.includes(
                title
              )}
              onClick={() => toggle(title)}
            >
              {title}
            </button>
          ))}

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
            !canAddTyped && (
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
