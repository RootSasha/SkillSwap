// =============================================================================
// src/context/TelegramContext.tsx
//
// Ініціалізація Telegram Web App SDK та надання даних юзера
// всьому дереву компонентів через React Context.
//
// Режими роботи:
//   1. "ready"       — відкрито в Telegram, SDK ініціалізовано, user отримано
//   2. "dev-mode"    — відкрито в браузері, використовується фейковий user
//   3. "unavailable" — SDK відсутній і DEV_MODE вимкнено (показуємо заглушку)
//   4. "loading"     — початковий стан до перевірки SDK
// =============================================================================

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import type {
  TelegramContextStatus,
  TelegramContextValue,
  TelegramUser,
  TelegramWebApp,
} from '../types'

// -----------------------------------------------------------------------------
// Фейковий юзер для локальної розробки в браузері
// Змінюй telegram_id на свій реальний для тестів з бекендом
// -----------------------------------------------------------------------------
const DEV_USER: TelegramUser = {
  id: 123456789,          // ← замінити на свій реальний Telegram ID
  first_name: 'Dev',
  last_name: 'User',
  username: 'dev_skillswap',
  language_code: 'uk',
}

// Вмикає dev-mode автоматично якщо SDK не знайдено.
// В продакшні залиш true — у Telegram SDK завжди буде присутній.
const ALLOW_DEV_MODE = true

// -----------------------------------------------------------------------------
// Створення контексту
// -----------------------------------------------------------------------------

const TelegramContext = createContext<TelegramContextValue | null>(null)

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------

interface TelegramProviderProps {
  children: ReactNode
}

export function TelegramProvider({ children }: TelegramProviderProps) {
  const [status, setStatus]   = useState<TelegramContextStatus>('loading')
  const [tgUser, setTgUser]   = useState<TelegramUser | null>(null)
  const [webApp, setWebApp]   = useState<TelegramWebApp | null>(null)
  const [isDevMode, setIsDevMode] = useState(false)

  useEffect(() => {
    const tg = window.Telegram?.WebApp

    if (tg) {
      // ── Реальний Telegram WebApp ──────────────────────────────────────────
      // Повідомляємо SDK що додаток готовий (прибирає splash screen)
      tg.ready()

      // Розгортаємо на весь екран
      tg.expand()

      const user = tg.initDataUnsafe?.user

      if (user) {
        setWebApp(tg)
        setTgUser(user)
        setStatus('ready')
      } else {
        // SDK є, але user відсутній — нестандартна ситуація
        console.warn('[TelegramContext] SDK знайдено, але user відсутній у initDataUnsafe')
        if (ALLOW_DEV_MODE) {
          setIsDevMode(true)
          setTgUser(DEV_USER)
          setStatus('dev-mode')
        } else {
          setStatus('unavailable')
        }
      }
    } else {
      // ── SDK не знайдено — браузерна розробка ──────────────────────────────
      if (ALLOW_DEV_MODE) {
        console.info(
          '[TelegramContext] SDK не знайдено. Увімкнено dev-mode з фейковим юзером:',
          DEV_USER,
        )
        setIsDevMode(true)
        setTgUser(DEV_USER)
        setStatus('dev-mode')
      } else {
        setStatus('unavailable')
      }
    }
  }, [])

  const value: TelegramContextValue = { status, tgUser, webApp, isDevMode }

  return (
    <TelegramContext.Provider value={value}>
      {children}
    </TelegramContext.Provider>
  )
}

// -----------------------------------------------------------------------------
// Хук для використання контексту
// -----------------------------------------------------------------------------

export function useTelegram(): TelegramContextValue {
  const ctx = useContext(TelegramContext)
  if (!ctx) {
    throw new Error('useTelegram() має викликатися всередині <TelegramProvider>')
  }
  return ctx
}
