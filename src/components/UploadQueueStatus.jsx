import {
  useEffect,
  useSyncExternalStore
} from 'react'
import cloudClient from '../utils/cloudClient'
import uploadQueue from '../utils/uploadQueue'

// 裏で送っている画像の状況を、どの画面でも下に小さく出す
function UploadQueueStatus() {
  const state =
    useSyncExternalStore(
      uploadQueue.subscribe,
      uploadQueue.getSnapshot
    )

  useEffect(() => {
    if (!cloudClient.isConfigured()) {
      return undefined
    }

    // 前回送り残したものを、続きから送る
    uploadQueue.start()

    // 電波が戻ったときや、アプリに戻ってきたときに、一時的な失敗を送り直す
    const handleOnline = () => {
      uploadQueue.retryTemporary()
    }

    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        uploadQueue.retryTemporary()
      }
    }

    window.addEventListener('online', handleOnline)
    document.addEventListener(
      'visibilitychange',
      handleVisible
    )

    return () => {
      window.removeEventListener(
        'online',
        handleOnline
      )
      document.removeEventListener(
        'visibilitychange',
        handleVisible
      )
    }
  }, [])

  const pending =
    state.batches.filter(
      (batch) => batch.status !== 'error'
    )

  const failed =
    state.batches.filter(
      (batch) => batch.status === 'error'
    )

  const remaining =
    pending.reduce(
      (total, batch) => total + batch.count,
      0
    ) - (state.current?.done || 0)

  if (pending.length > 0) {
    return (
      <div
        className="upload-queue-status"
        role="status"
      >
        送信中 残り {Math.max(0, remaining)} 枚
      </div>
    )
  }

  if (failed.length > 0) {
    const count =
      failed.reduce(
        (total, batch) => total + batch.count,
        0
      )

    return (
      <div
        className="upload-queue-status error"
        role="alert"
      >
        <span>
          送信できなかった画像 {count} 枚
        </span>
        <button
          type="button"
          onClick={() => uploadQueue.retry()}
        >
          もう一度送る
        </button>
      </div>
    )
  }

  return null
}

export default UploadQueueStatus
