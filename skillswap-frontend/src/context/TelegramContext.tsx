import React, { createContext, useContext, useEffect, useState } from 'react'
import type { TelegramContextStatus, TelegramContextValue, TelegramUser, TelegramWebApp } from '../types'
import { initApi, getApi } from '../services/api'
import axios from 'axios'

const TelegramContext = createContext<TelegramContextValue | undefined>(undefined)

// ─────────────────────────────────────────────────────────────────────────────
// ВАЖЛИВО (production-автентифікація):
//
// Раніше тут був DEV_USER з фейковим id=1, і саме цей числовий id (а в проді —
// initDataUnsafe.user.id) йшов прямо в API як current_user_id. Це небезпечно:
// initDataUnsafe — НЕПІДПИСАНІ дані, будь-хто з DevTools міг підмінити id
// на чужий і отримати доступ до чужого профілю/матчів.
//
// Тепер:
//   • В Telegram — передаємо в API сирий app.initData (підписаний рядок),
//     а не число з initDataUnsafe. Підпис перевіряє backend, підробити
//     без BOT_TOKEN неможливо.
//   • У звичайному браузері (dev) — initData немає взагалі. API-клієнт
//     ініціалізується порожнім рядком; запити пройдуть лише якщо backend
//     має DEV_MODE_BYPASS_AUTH=true у своєму .env (див. config.py).
//     Це і є новий статус 'dev-mode' — він більше не вигадує власний id,
//     а просто покладається на дозвіл бекенду.
//   • Якщо initData валідний, але юзера нема в БД (не натискав /start) —
//     перший виклик getMe() поверне 403, і ми переходимо в статус
//     'not-registered' замість того, щоб показувати порожній/зламаний екран.
// ─────────────────────────────────────────────────────────────────────────────

export const TelegramProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<TelegramContextStatus>('loading')
  const [tgUser, setTgUser] = useState<TelegramUser | null>(null)
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const app = window.Telegram?.WebApp

      if (app && app.initData) {
        // ── РЕЖИМ: Додаток запущено всередині Telegram ──────────────────────
        app.ready()
        app.expand()

        setWebApp(app)
        setTgUser(app.initDataUnsafe?.user ?? null)

        // Передаємо САМЕ підписаний рядок, не initDataUnsafe.user.id
        initApi(app.initData)
      } else if (import.meta.env.DEV) {
        // ── РЕЖИМ: звичайний браузер, локальна розробка ─────────────────────
        // initData немає — передаємо порожній рядок. Запит пройде тільки
        // якщо backend дозволяє DEV_MODE_BYPASS_AUTH.
        initApi('')
      } else {
        // ── РЕЖИМ: прод, але відкрито не в Telegram — блокуємо доступ ────────
        if (!cancelled) setStatus('unavailable')
        return
      }

      // Перевіряємо, чи юзер реально існує в БД (тобто чи написав /start).
      // Це єдиний надійний спосіб дізнатись: initData може бути валідним,
      // але якщо людина ще не торкалась бота — записів про неї нема.
      try {
        await getApi().getMe()
        if (!cancelled) {
          setStatus(app && app.initData ? 'ready' : 'dev-mode')
        }
      } catch (error) {
        if (cancelled) return

        if (axios.isAxiosError(error) && error.response?.status === 403) {
          setStatus('not-registered')
        } else if (axios.isAxiosError(error) && error.response?.status === 401) {
          // initData відсутній/невалідний і DEV_MODE_BYPASS_AUTH вимкнений —
          // показуємо той самий екран, що й "відкрито не в Telegram"
          setStatus('unavailable')
        } else {
          // Мережева помилка чи 500 — не валимо весь застосунок,
          // даємо сторінкам самим показати свій retry-стан при наступних
          // запитах. 'ready'/'dev-mode' тут навмисно не ставимо помилково.
          console.error('[Telegram] Не вдалося перевірити юзера:', error)
          if (!cancelled) {
            setStatus(app && app.initData ? 'ready' : 'dev-mode')
          }
        }
      }
    }

    bootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  const isDevMode = status === 'dev-mode'

  return (
    <TelegramContext.Provider value={{ status, tgUser, webApp, isDevMode }}>
      {children}
    </TelegramContext.Provider>
  )
}

export const useTelegram = () => {
  const context = useContext(TelegramContext)
  if (!context) {
    throw new Error('useTelegram має використовуватись всередині TelegramProvider')
  }
  return context
}
