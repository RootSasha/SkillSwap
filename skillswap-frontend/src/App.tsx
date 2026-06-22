// =============================================================================
// src/App.tsx
//
// Кореневий компонент.
// Відповідає за:
//   1. Перевірку статусу Telegram SDK
//   2. Показ заглушки якщо відкрито не в Telegram (і не dev-mode)
//   3. Рендер роутингу між сторінками
// =============================================================================

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useTelegram } from './context/TelegramContext'
import Home    from './pages/Home'
import Matches from './pages/Matches'
import Profile from './pages/Profile'

// -----------------------------------------------------------------------------
// Заглушка для звичайного браузера (коли SDK відсутній і dev-mode вимкнено)
// -----------------------------------------------------------------------------

function UnavailableScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
      <div className="max-w-xs text-center space-y-4">
        {/* Іконка */}
        <div className="w-24 h-24 rounded-full bg-brand-primary/10 flex items-center justify-center mx-auto">
          <span className="text-5xl">✈️</span>
        </div>

        <h1 className="text-2xl font-bold text-brand-dark">
          Відкрийте у Telegram
        </h1>

        <p className="text-gray-500 text-sm leading-relaxed">
          SkillSwap — це Telegram Mini App. Щоб скористатись сервісом,
          відкрийте його через Telegram.
        </p>

        {/* Посилання на бота */}
        <a
          href="skillswap.ngrok-free.app"  // ← замінити на реального бота
          className="inline-block mt-2 px-6 py-3 bg-brand-primary text-white font-semibold rounded-2xl shadow-lg hover:bg-brand-primary/90 transition-colors"
        >
          Відкрити в Telegram →
        </a>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Заглушка: initData валідний, але юзера нема в БД (не написав /start боту)
// -----------------------------------------------------------------------------

function NotRegisteredScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
      <div className="max-w-xs text-center space-y-4">
        <div className="w-24 h-24 rounded-full bg-brand-primary/10 flex items-center justify-center mx-auto">
          <span className="text-5xl">👋</span>
        </div>

        <h1 className="text-2xl font-bold text-brand-dark">
          Ще секунда
        </h1>

        <p className="text-gray-500 text-sm leading-relaxed">
          Напишіть боту команду <b>/start</b>, щоб зареєструватись,
          а потім відкрийте SkillSwap знову через кнопку в боті.
        </p>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Завантажувальний екран
// -----------------------------------------------------------------------------

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-sm">Завантаження...</p>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Головний компонент маршрутизації
// -----------------------------------------------------------------------------

function AppRoutes() {
  const { status } = useTelegram()

  // Показуємо лоадер поки перевіряємо SDK
  if (status === 'loading') return <LoadingScreen />

  // Показуємо заглушку якщо відкрито не в Telegram і dev-mode вимкнено
  if (status === 'unavailable') return <UnavailableScreen />

  // initData валідний, але юзера нема в БД — не написав /start боту
  if (status === 'not-registered') return <NotRegisteredScreen />

  // Основний роутинг (status === 'ready' або 'dev-mode')
  return (
    <Routes>
      <Route path="/"        element={<Home />}    />
      <Route path="/profile" element={<Profile />} />
      <Route path="/matches" element={<Matches />} />
      {/* Редірект будь-якого невідомого шляху на головну */}
      <Route path="*"        element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
