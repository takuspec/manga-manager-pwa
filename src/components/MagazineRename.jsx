import { useState } from 'react'
import { renameMagazine } from '../utils/colorStore'
import { normalizeSlug } from '../utils/colorLibrary'

// 雑誌の名前とフォルダ名を変える。
// フォルダ名を変えると、登録済みの画像をすべて新しい場所へ移す。
function MagazineRename({
  magazine,
  onRenamed
}) {
  const [name, setName] =
    useState(magazine.name)

  const [slug, setSlug] =
    useState(magazine.slug)

  const [busy, setBusy] = useState('')

  const [message, setMessage] =
    useState(null)

  const handleSubmit = async (event) => {
    event.preventDefault()

    const cleanSlug = normalizeSlug(slug)

    if (!cleanSlug) {
      setMessage({
        type: 'error',
        text: 'フォルダ名は半角の英小文字・数字・ハイフンで入力してください（例: jump）。'
      })
      return
    }

    if (
      cleanSlug !== magazine.slug &&
      !window.confirm(
        `フォルダ名を「${magazine.slug}」から「${cleanSlug}」に変えますか？\n登録済みの画像をすべて新しい場所へ移します。終わるまでこの画面を閉じないでください。`
      )
    ) {
      return
    }

    setMessage(null)
    setBusy('準備中…')

    try {
      const result =
        await renameMagazine({
          from: magazine.slug,
          to: cleanSlug,
          name,
          onProgress: ({
            phase,
            done,
            total
          }) => {
            setBusy(
              phase === 'copy'
                ? `画像を移しています ${done} / ${total}`
                : `古いファイルを消しています ${done} / ${total}`
            )
          }
        })

      onRenamed(result.magazine)

      setMessage({
        type: result.leftover
          ? 'error'
          : 'ok',
        text: result.leftover
          ? `変更しました。古いファイルが ${result.leftover} 件消せずに残っています（表示には影響しません）。`
          : '変更しました。'
      })
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error?.message ||
          '変更できませんでした。'
      })
    } finally {
      setBusy('')
    }
  }

  return (
    <details className="color-crop-settings">
      <summary>
        名前とフォルダ名
        <small>{magazine.slug}</small>
      </summary>

      <form
        className="color-crop-body"
        onSubmit={handleSubmit}
      >
        <label className="cloud-settings-field">
          <span>雑誌名</span>
          <input
            type="text"
            value={name}
            disabled={Boolean(busy)}
            onChange={(event) =>
              setName(event.target.value)
            }
          />
        </label>

        <label className="cloud-settings-field">
          <span>
            フォルダ名（半角の英小文字・数字・ハイフン）
          </span>
          <input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={slug}
            disabled={Boolean(busy)}
            onChange={(event) =>
              setSlug(event.target.value)
            }
          />
        </label>

        <p className="cloud-settings-note">
          フォルダ名を変えると、登録済みの画像を1枚ずつ新しい場所へ移します。100枚でおよそ2〜3分かかります。途中で失敗しても、元の状態のまま使えます。
        </p>

        <div className="cloud-settings-actions">
          <button
            type="submit"
            disabled={Boolean(busy)}
          >
            {busy ? '変更中…' : '変更'}
          </button>
        </div>

        {busy && (
          <div
            className="cloud-settings-message"
            role="status"
          >
            {busy}
          </div>
        )}

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
      </form>
    </details>
  )
}

export default MagazineRename
