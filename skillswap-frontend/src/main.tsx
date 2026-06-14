// =============================================================================
// src/main.tsx
//
// Точка входу React-додатку.
// Порядок обгорток важливий:
//   StrictMode → TelegramProvider → App
// =============================================================================

import React from 'react'
import ReactDOM from 'react-dom/client'

import { TelegramProvider } from './context/TelegramContext'
import App from './App'

// Глобальні стилі Tailwind CSS
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/*
      TelegramProvider — найвищий рівень, бо telegram_id потрібен
      практично скрізь: в API-запитах, в компонентах, в сервісах.
    */}
    <TelegramProvider>
      <App />
    </TelegramProvider>
  </React.StrictMode>,
)
