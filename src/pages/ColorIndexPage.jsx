import { useEffect, useState } from 'react'
import PrimaryNav from '../components/PrimaryNav'
import AppIcon from '../components/AppIcon'
import cloudClient from '../utils/cloudClient'
import {
  loadRootIndex,
  updateRootIndex
} from '../utils/colorStore'
import {
  normalizeSlug,
  upsertMagazine
} from '../utils/colorLibrary'

function ColorIndexPage({
  magazineList,
  navigate
}) {
  const [configured] =
    useState(() =>
      cloudClient.isConfigured()
    )

  const [state, setState] =
    useState({
      status: 'loading',
      root: null,
      fromCache: false,
      error: ''
    })

  const [isAdding, setIsAdding] =
    useState(false)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [formError, setFormError] =
    useState('')
  const [saving, setSaving] =
    useState(false)

  useEffect(() => {
    if (!configured) {
      return undefined
    }

    let active = true

    loadRootIndex()
      .then((result) => {
        if (active) {
          setState({
            status: 'ready',
            root: result.root,
            fromCache: result.fromCache,
            error: ''
          })
        }
      })
      .catch((error) => {
        if (active) {
          setState({
            status: 'error',
            root: null,
            fromCache: false,
            error:
              error?.message ||
              '読み込めませんでした。'
          })
        }
      })

    return () => {
      active = false
    }
  }, [configured])

  const magazines =
    state.root?.magazines || []

  const usedNames =
    new Set(
      magazines.map(
        (magazine) => magazine.name
      )
    )

  const suggestions =
    magazineList.filter((magazine) => {
      return !usedNames.has(magazine.name)
    })

  const handleAdd = async (event) => {
    event.preventDefault()

    const cleanSlug = normalizeSlug(slug)
    const cleanName = name.trim()

    if (!cleanName) {
      setFormError(
        '雑誌名を入力してください。'
      )
      return
    }

    if (!cleanSlug) {
      setFormError(
        'フォルダ名は半角の英小文字・数字・ハイフンで入力してください（例: jump）。'
      )
      return
    }

    if (
      magazines.some(
        (magazine) =>
          magazine.slug === cleanSlug
      )
    ) {
      setFormError(
        'そのフォルダ名はすでに使われています。'
      )
      return
    }

    setSaving(true)
    setFormError('')

    try {
      const root =
        await updateRootIndex((current) =>
          upsertMagazine(current, {
            slug: cleanSlug,
            name: cleanName
          })
        )

      setState({
        status: 'ready',
        root,
        fromCache: false,
        error: ''
      })
      setName('')
      setSlug('')
      setIsAdding(false)
    } catch (error) {
      setFormError(
        error?.message ||
          '保存できませんでした。'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app">
      <div className="page-title-row">
        <div className="title">
          カラーページ
        </div>

        <button
          type="button"
          className="page-settings-button"
          aria-label="クラウド設定"
          onClick={() =>
            navigate('/cloud-settings')
          }
        >
          <AppIcon name="settings" />
        </button>
      </div>

      {!configured && (
        <div className="color-notice">
          <p>
            カラーページはクラウドに保存します。先に接続先と合言葉を設定してください。
          </p>
          <button
            type="button"
            onClick={() =>
              navigate('/cloud-settings')
            }
          >
            クラウド設定を開く
          </button>
        </div>
      )}

      {configured &&
        state.status === 'loading' && (
          <div className="empty-message">
            読み込み中…
          </div>
        )}

      {state.status === 'error' && (
        <div className="color-notice error">
          <p>{state.error}</p>
        </div>
      )}

      {state.status === 'ready' && (
        <div className="completed-magazine-list">
          {state.fromCache && (
            <div className="color-notice">
              <p>
                通信できないため、前回の内容を表示しています。
              </p>
            </div>
          )}

          {magazines.length === 0 &&
            !isAdding && (
              <div className="empty-message">
                まだ雑誌がありません。下のボタンから追加してください。
              </div>
            )}

          {magazines.map((magazine) => (
            <button
              key={magazine.slug}
              type="button"
              className="weekly-settings-card"
              onClick={() =>
                navigate(
                  `/color/${magazine.slug}`
                )
              }
            >
              <span>
                {magazine.name}
                <small className="image-size-test-meta">
                  {magazine.slug}・
                  {magazine.years.length > 0
                    ? `${magazine.years.length}年分`
                    : '未登録'}
                </small>
              </span>
              <strong>›</strong>
            </button>
          ))}

          {!isAdding &&
            !state.fromCache && (
              <button
                type="button"
                className="cloud-settings-secondary"
                onClick={() =>
                  setIsAdding(true)
                }
              >
                雑誌を追加
              </button>
            )}

          {isAdding && (
            <form
              className="cloud-settings-section"
              onSubmit={handleAdd}
            >
              <h2>雑誌を追加</h2>

              {suggestions.length > 0 && (
                <div className="color-chip-row">
                  {suggestions.map(
                    (magazine) => (
                      <button
                        key={magazine.id}
                        type="button"
                        className="color-chip"
                        onClick={() =>
                          setName(
                            magazine.name
                          )
                        }
                      >
                        {magazine.name}
                      </button>
                    )
                  )}
                </div>
              )}

              <label className="cloud-settings-field">
                <span>雑誌名</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) =>
                    setName(
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="cloud-settings-field">
                <span>
                  フォルダ名（半角英数字。後から変えられません）
                </span>
                <input
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="jump"
                  value={slug}
                  onChange={(event) =>
                    setSlug(
                      event.target.value
                    )
                  }
                />
              </label>

              {formError && (
                <div
                  className="cloud-settings-message error"
                  role="alert"
                >
                  {formError}
                </div>
              )}

              <div className="cloud-settings-actions">
                <button
                  type="submit"
                  disabled={saving}
                >
                  {saving
                    ? '保存中…'
                    : '追加'}
                </button>

                <button
                  type="button"
                  className="cloud-settings-secondary"
                  disabled={saving}
                  onClick={() => {
                    setIsAdding(false)
                    setFormError('')
                  }}
                >
                  やめる
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <PrimaryNav
        current="/color"
        navigate={navigate}
      />
    </div>
  )
}

export default ColorIndexPage
