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
