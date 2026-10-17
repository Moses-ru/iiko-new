import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './responsive.css'
import './design.css'

try { document.documentElement.dataset.theme = localStorage.getItem('iiko-display-theme') === 'light' ? 'light' : 'dark'; } catch { document.documentElement.dataset.theme = 'dark'; }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Оболочка в кэше: приложение открывается без связи и показывает последние данные.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {
      /* приватный режим или заблокированные воркеры — приложение работает и без него */
    });
  });
}
