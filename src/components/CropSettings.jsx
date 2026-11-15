import { useState } from 'react'
import { updateRootIndex } from '../utils/colorStore'
import {
  CROP_PRESETS,
  findCropPreset,
  normalizeCrop,
  setMagazineCrops
} from '../utils/colorLibrary'

const ORIENTATIONS = [
  {
    id: 'portrait',
    label: '縦長（表紙・センターカラー）',
    width: 2048,
    height: 2732
  },
  {
    id: 'landscape',
    label: '横長（見開き）',
    width: 2732,
    height: 2048
  }
]

const FIELDS = [
  { id: 'top', label: '上' },
  { id: 'bottom', label: '下' },
  { id: 'left', label: '左' },
  { id: 'right', label: '右' }
]

// 入力欄は文字列で持つ（入力途中の空欄を許すため）
function toForm(crops) {
  const form = {}

  for (const orientation of ORIENTATIONS) {
    const crop = crops?.[orientation.id]

    form[orientation.id] = {
      enabled: Boolean(crop),
      width: String(
        crop?.width ?? orientation.width
      ),
      height: String(
        crop?.height ?? orientation.height
      ),
      top: String(crop?.top ?? 0),
      bottom: String(crop?.bottom ?? 0),
      left: String(crop?.left ?? 0),
      right: String(crop?.right ?? 0)
    }
  }

  return form
}

function describe(crop) {
  return crop
    ? `上${crop.top}・下${crop.bottom}・左${crop.left}・右${crop.right}px（元画像 ${crop.width}×${crop.height}）`
    : '未設定（画像から自動で判定）'
}

// 雑誌ごとの切り落としの固定値を決める。
// スクリーンショットから除く範囲は「雑誌 × 縦長／横長」で決まっているので、
// 一度決めれば、以後の取り込みは毎回同じ範囲で切る。
function CropSettings({
  magazine,
  onSaved
}) {
  const [form, setForm] =
    useState(() => toForm(magazine.crops))

  const [saving, setSaving] =
    useState(false)

  const [message, setMessage] =
    useState(null)

  const suggested =
    findCropPreset(
      magazine.name,
      magazine.slug
    )

  const presets =
    suggested
      ? [
          suggested,
          ...CROP_PRESETS.filter(
            (preset) =>
              preset.id !== suggested.id
          )
        ]
      : CROP_PRESETS

  const setField = (
    orientation,
    field,
    value
  ) => {
    setForm({
      ...form,
      [orientation]: {
        ...form[orientation],
        [field]: value
      }
    })
  }

  const save = async (crops) => {
    setSaving(true)
    setMessage(null)

    try {
      const root =
        await updateRootIndex((current) =>
          setMagazineCrops(
            current,
            magazine.slug,
            crops
          )
        )

      const saved =
        root.magazines.find(
          (item) =>
            item.slug === magazine.slug
        )

      setForm(toForm(saved?.crops))
      onSaved(saved)
      setMessage({
        type: 'ok',
        text: '保存しました。次の取り込みから使われます。'
      })
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error?.message ||
          '保存できませんでした。'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const crops = {}

    for (const orientation of ORIENTATIONS) {
      const values = form[orientation.id]

      if (!values.enabled) {
        continue
      }

      const crop =
        normalizeCrop({
          width: Number(values.width),
          height: Number(values.height),
          top: Number(values.top),
          bottom: Number(values.bottom),
          left: Number(values.left),
          right: Number(values.right)
        })

      if (!crop) {
        setMessage({
          type: 'error',
          text: `${orientation.label}の値を確認してください。0以上の整数で、切る幅の合計は元画像の半分までです。`
        })
        return
      }

      crops[orientation.id] = crop
    }

    save(crops)
  }

  return (
    <details className="color-crop-settings">
      <summary>
        切り落としの設定
        <small>
          {magazine.crops.portrait ||
          magazine.crops.landscape
            ? '固定値を使用中'
            : '自動判定'}
        </small>
      </summary>

      <div className="color-crop-body">
        <p className="cloud-settings-note">
          スクリーンショットから除く範囲を、この雑誌の縦長・横長ごとに固定します。未設定の向きは、画像から自動で判定します。
        </p>

        <div className="cloud-settings-field">
          <span>
            iPad（2048×2732）で測った値を使う
          </span>
          <div className="color-chip-row">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={
                  preset.id === suggested?.id
                    ? 'color-chip selected'
                    : 'color-chip'
                }
                disabled={saving}
                onClick={() =>
                  save(preset.crops)
                }
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <form
          className="color-crop-form"
          onSubmit={handleSubmit}
        >
          {ORIENTATIONS.map(
            (orientation) => {
              const values =
                form[orientation.id]

              return (
                <fieldset
                  key={orientation.id}
                >
                  <legend>
                    {orientation.label}
                  </legend>

                  <p className="cloud-settings-note">
                    現在:{' '}
                    {describe(
                      magazine.crops[
                        orientation.id
                      ]
                    )}
                  </p>

                  <label className="color-check">
                    <input
                      type="checkbox"
                      checked={values.enabled}
                      onChange={(event) =>
                        setField(
                          orientation.id,
                          'enabled',
                          event.target.checked
                        )
                      }
                    />
                    固定値を使う
                  </label>

                  {values.enabled && (
                    <>
                      <div className="color-crop-grid">
                        {FIELDS.map((field) => (
                          <label
                            key={field.id}
                          >
                            <span>
                              {field.label}
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={
                                values[field.id]
                              }
                              onChange={(
                                event
                              ) =>
                                setField(
                                  orientation.id,
                                  field.id,
                                  event.target
                                    .value
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>

                      <div className="color-crop-grid two">
                        <label>
                          <span>
                            元画像の幅
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={values.width}
                            onChange={(event) =>
                              setField(
                                orientation.id,
                                'width',
                                event.target
                                  .value
                              )
                            }
                          />
                        </label>

                        <label>
                          <span>
                            元画像の高さ
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={
                              values.height
                            }
                            onChange={(event) =>
                              setField(
                                orientation.id,
                                'height',
                                event.target
                                  .value
                              )
                            }
                          />
                        </label>
                      </div>
                    </>
                  )}
                </fieldset>
              )
            }
          )}

          <div className="cloud-settings-actions">
            <button
              type="submit"
              disabled={saving}
            >
              {saving
                ? '保存中…'
                : 'この値で保存'}
            </button>
          </div>
        </form>

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
      </div>
    </details>
  )
}

export default CropSettings
