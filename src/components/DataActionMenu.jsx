import AppIcon from './AppIcon'
import { useRef, useState } from 'react'

// アップデートが届いたか確かめられるよう、バージョンと作った日時を出す
const BUILD_TIME =
  import.meta.env.VITE_BUILD_TIME
    ? new Date(import.meta.env.VITE_BUILD_TIME)
    : null

const APP_VERSION_TEXT =
  `ver ${import.meta.env.VITE_APP_VERSION || '-'}` +
  (BUILD_TIME &&
  !Number.isNaN(BUILD_TIME.getTime())
    ? `（${BUILD_TIME.toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })}）`
    : '')

function DataActionMenu({
  onBackupData,
  onImportData,
  onWeeklySettings,
  onAddMagazine
}) {
  const [isOpen, setIsOpen] =
    useState(false)

  const fileInputRef =
    useRef(null)

  const handleBackup = async () => {
    const ok =
      window.confirm(
        'バックアップしますか？'
      )

    if (!ok) {
      return
    }

    try {
      await onBackupData()
      setIsOpen(false)
    } catch {
      window.alert(
        'バックアップに失敗しました。'
      )
    }
  }

  const handleImportButtonClick = () => {
    const ok =
      window.confirm(
        'インポートしますか？'
      )

    if (!ok) {
      return
    }

    fileInputRef.current?.click()
  }

  const handleImportFileChange =
    async (e) => {
      const files =
        Array.from(
          e.target.files || []
        )

      e.target.value = ''

      if (!files.length) {
        return
      }

      try {
        await onImportData(files)
        window.alert('インポートしました。')
        setIsOpen(false)
      } catch (error) {
        window.alert(
          error?.message ||
            'インポートに失敗しました。バックアップファイルを確認してください。'
        )
      }
    }

  return (
    <div className="data-action">
      <button
        type="button"
        className="page-settings-button"
        aria-label="オプション"
        aria-expanded={isOpen}
        onClick={() =>
          setIsOpen(!isOpen)
        }
      >
        <AppIcon name="settings" />
      </button>

      {isOpen && (
        <div className="data-action-menu">
          {onAddMagazine && (
            <button
              type="button"
              onClick={() => {
                onAddMagazine()
                setIsOpen(false)
              }}
            >
              雑誌追加
            </button>
          )}
          {onWeeklySettings && (
            <button
              type="button"
              onClick={() => {
                onWeeklySettings()
                setIsOpen(false)
              }}
            >
              週刊誌情報
            </button>
          )}

          <button
            type="button"
            onClick={handleImportButtonClick}
          >
            データインポート
          </button>

          <button
            type="button"
            onClick={handleBackup}
          >
            バックアップ
          </button>

          <div className="data-action-version">
            {APP_VERSION_TEXT}
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        className="data-import-input"
        type="file"
        accept="application/json,.json"
        multiple
        onChange={handleImportFileChange}
      />
    </div>
  )
}

export default DataActionMenu
