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

createRoot(
  document.getElementById('root')
).render(
  <StrictMode>
    <BrowserRouter basename="/manga-manager-pwa">
      <App />
    </BrowserRouter>
  </StrictMode>
)