import React, { createContext, useContext, useEffect, useState } from 'react'
import type { TelegramContextStatus, TelegramContextValue, TelegramUser, TelegramWebApp } from '../types'
import { initApi } from '../services/api'

const TelegramContext = createContext<TelegramContextValue | undefined>(undefined)

// Константа для фейкового юзера в браузері (щоб розробка була зручною)
const DEV_USER: TelegramUser = {
  id: 3, // Твій реальний або тестовий telegram_id
  first_name: 'Sasha (Dev)',
  username: 'sasha_dev'
}

export const TelegramProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<TelegramContextStatus>('loading')
  const [tgUser, setTgUser] = useState<TelegramUser | null>(null)
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null)

  useEffect(() => {
    // Перевіряємо, чи доступний глобальний об'єкт Telegram SDK
    const app = window.Telegram?.WebApp

    if (app && app.initDataUnsafe && app.initDataUnsafe.user) {
      // 1. РЕЖИМ: Додаток запущено всередині Telegram
      app.ready()
      app.expand() // Розгортаємо на максимум
      
      setWebApp(app)
      setTgUser(app.initDataUnsafe.user)
      setStatus('ready')
      
      // Ініціалізуємо API-клієнт реальним telegram_id
      initApi(app.initDataUnsafe.user.id)
    } else {
      // 2. РЕЖИМ: Запущено в звичайному браузері (локальна розробка)
      // Якщо ми перебуваємо в dev-режимі Vite (npm run dev)
      if (import.meta.env.DEV) {
        setTgUser(DEV_USER)
        setStatus('dev-mode')
        
        // Ініціалізуємо API-клієнт фейковим ID для тестів
        initApi(DEV_USER.id)
      } else {
        // 3. РЕЖИМ: Прод, але відкрито не в Telegram — блокуємо доступ
        setStatus('unavailable')
      }
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
