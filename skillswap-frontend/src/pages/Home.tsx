// =============================================================================
// src/pages/Home.tsx
//
// Головна сторінка — вітання та статус підключення до Telegram SDK.
// Крок 3.1: базова заглушка. В Кроці 3.2 тут з'явиться свайп-колода.
// =============================================================================

import { useTelegram } from '../context/TelegramContext'

export default function Home() {
  const { tgUser, status, isDevMode, webApp } = useTelegram()

  // Визначаємо відображуване ім'я
  const displayName = tgUser?.username
    ? `@${tgUser.username}`
    : tgUser?.first_name ?? 'Користувач'

  // Колір статусного бейджа залежно від режиму
  const statusBadge = {
    ready:       { label: '✅ Telegram SDK підключено', cls: 'bg-green-100 text-green-700' },
    'dev-mode':  { label: '🛠 Dev Mode (браузер)', cls: 'bg-yellow-100 text-yellow-700' },
    unavailable: { label: '❌ SDK недоступний', cls: 'bg-red-100 text-red-700' },
    loading:     { label: '⏳ Завантаження...', cls: 'bg-gray-100 text-gray-500' },
  }[status]

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10 flex flex-col items-center justify-center p-6">

      {/* Логотип */}
      <div className="mb-8 text-center animate-slide-up">
        <div className="w-20 h-20 rounded-3xl bg-brand-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
          <span className="text-4xl">🔄</span>
        </div>
        <h1 className="text-3xl font-bold text-brand-dark tracking-tight">
          SkillSwap
        </h1>
        <p className="text-sm text-gray-500 mt-1">Біржа інтелектуального бартеру</p>
      </div>

      {/* Картка привітання */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-6 space-y-5 animate-fade-in">

        {/* Привітання */}
        <div className="text-center">
          <p className="text-gray-400 text-sm uppercase tracking-widest mb-1">Привіт!</p>
          <h2 className="text-2xl font-bold text-brand-dark">{displayName}</h2>
          {tgUser?.first_name && tgUser.username && (
            <p className="text-gray-500 text-sm mt-1">{tgUser.first_name}</p>
          )}
        </div>

        <hr className="border-gray-100" />

        {/* Telegram ID */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">Telegram ID</span>
          <span className="font-mono text-sm font-semibold text-brand-primary bg-brand-primary/10 px-3 py-1 rounded-full">
            {tgUser?.id ?? '—'}
          </span>
        </div>

        {/* Платформа */}
        {webApp && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Платформа</span>
            <span className="text-sm font-medium text-gray-600 capitalize">
              {webApp.platform}
            </span>
          </div>
        )}

        {/* Кольорова схема */}
        {webApp && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Тема</span>
            <span className="text-sm font-medium text-gray-600 capitalize">
              {webApp.colorScheme === 'dark' ? '🌙 Темна' : '☀️ Світла'}
            </span>
          </div>
        )}

        {/* Статус SDK */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">Статус SDK</span>
          <span className={`text-xs font-medium px-3 py-1 rounded-full ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>
        </div>

        {/* Dev mode попередження */}
        {isDevMode && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-3 text-xs text-yellow-700">
            <p className="font-semibold mb-1">⚠️ Режим розробки</p>
            <p>
              Використовується фейковий Telegram ID <code className="font-mono">{DEV_TELEGRAM_ID}</code>.
              Змінити у <code>src/context/TelegramContext.tsx</code> → <code>DEV_USER.id</code>
            </p>
          </div>
        )}
      </div>

      {/* Наступний крок */}
      <p className="mt-8 text-center text-xs text-gray-400 max-w-xs">
        Крок 3.1 завершено ✓ Далі — реалізація свайп-колоди та профілю
      </p>
    </div>
  )
}

// Виводимо константу для dev-mode підказки
const DEV_TELEGRAM_ID = 123456789
