import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// 端末の空き容量が減っても保存データが自動削除されにくいよう、
// ブラウザーに永続化を依頼する（対応していない環境では何もしない）。
if (navigator.storage?.persist) {
  navigator.storage
    .persist()
    .catch(() => {})
}

// 以前あったカラーページ機能が端末に残したデータ（画像のキャッシュ、
// 送信待ちの画像、クラウドの接続先）を消す。漫画の記録には触れない。
try {
  indexedDB?.deleteDatabase('manga-cloud-cache')
  indexedDB?.deleteDatabase('manga-upload-queue')
  localStorage.removeItem('cloud-config-v1')
} catch {
  // 使えない環境では何もしない
}

createRoot(
  document.getElementById('root')
).render(
  <StrictMode>
    <BrowserRouter basename="/manga-manager-pwa">
      <App />
    </BrowserRouter>
  </StrictMode>
)