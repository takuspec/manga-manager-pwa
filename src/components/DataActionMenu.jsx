import { useRef, useState } from 'react'

function DataActionMenu({
  onBackupData,
  onImportData,
  onWeeklySettings
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

  const handleSplitBackup = async () => {
    const ok =
      window.confirm(
        '分割バックアップを作成しますか？画像が多い場合はこちらを使ってください。'
      )

    if (!ok) {
      return
    }

    try {
      await onBackupData({
        split: true
      })
      setIsOpen(false)
    } catch {
      window.alert(
        '分割バックアップに失敗しました。'
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
        aria-label="データメニュー"
        onClick={() =>
          setIsOpen(!isOpen)
        }
      >
        ⚙
      </button>

      {isOpen && (
        <div className="data-action-menu">
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

          <button
            type="button"
            onClick={handleSplitBackup}
          >
            分割バックアップ
          </button>
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
