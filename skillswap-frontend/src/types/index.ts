// =============================================================================
// src/types/index.ts
// TypeScript-інтерфейси для всього проєкту SkillSwap
// =============================================================================

// -----------------------------------------------------------------------------
// Telegram Web App SDK типи
// -----------------------------------------------------------------------------

/** Дані користувача з Telegram initDataUnsafe */
export interface TelegramUser {
  id: number           // telegram_id — головний ідентифікатор
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
}

/** Мінімальний тип для window.Telegram.WebApp */
export interface TelegramWebApp {
  initData: string
  initDataUnsafe: {
    user?: TelegramUser
    query_id?: string
    auth_date?: number
    hash?: string
  }
  version: string
  platform: string
  colorScheme: 'light' | 'dark'
  themeParams: {
    bg_color?: string
    text_color?: string
    hint_color?: string
    link_color?: string
    button_color?: string
    button_text_color?: string
    secondary_bg_color?: string
  }
  isExpanded: boolean
  viewportHeight: number
  viewportStableHeight: number
  ready: () => void
  expand: () => void
  close: () => void
  showAlert: (message: string) => void
  showConfirm: (message: string, callback: (confirmed: boolean) => void) => void
  // Відкриває посилання нативно всередині Telegram (без виходу в браузер)
  openTelegramLink: (url: string) => void
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy') => void
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void
  }
}

// Розширюємо глобальний Window
declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp
    }
  }
}

// -----------------------------------------------------------------------------
// Бізнес-моделі (відповідають схемам бекенду)
// -----------------------------------------------------------------------------

/** Навичка */
export interface Skill {
  id: number
  name: string
}

/** Повний профіль користувача (відповідь GET /api/users/me) */
export interface User {
  id: number
  telegram_id: number
  username: string | null
  first_name: string
  bio: string | null
  karma_balance: number
  rating: number
  offers: Skill[]
  seeks: Skill[]
}

/** Картка кандидата (відповідь GET /api/cards/next) */
export interface Card {
  id: number
  username: string | null
  first_name: string
  bio: string | null
  rating: number
  karma_balance: number
  offers: string[]
  seeks: string[]
}

/** Payload для свайпу */
export interface SwipePayload {
  to_user_id: number
  is_like: boolean
}

/** Відповідь після свайпу */
export interface SwipeResult {
  recorded: boolean
  match: boolean
  matched_user_id: number | null
}

/**
 * Юзер з яким стався взаємний матч.
 * Відповідь GET /api/cards/matches — масив таких об'єктів.
 * offers/seeks — масиви рядків (назви навичок), як у Card.
 */
export interface MatchedUser {
  id: number
  username: string | null
  first_name: string
  bio: string | null
  rating: number
  karma_balance: number
  offers: string[]
  seeks: string[]
}

/** Payload для оновлення навичок */
export interface UserSkillsUpdate {
  offers: number[]
  seeks: number[]
}

// -----------------------------------------------------------------------------
// Стан контексту Telegram
// -----------------------------------------------------------------------------

export type TelegramContextStatus =
  | 'loading'
  | 'ready'
  | 'dev-mode'
  | 'unavailable'
  | 'not-registered'  // initData валідний, але юзера нема в БД — не написав /start боту

export interface TelegramContextValue {
  status: TelegramContextStatus
  tgUser: TelegramUser | null
  webApp: TelegramWebApp | null
  isDevMode: boolean
}
