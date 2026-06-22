import axios, { type AxiosInstance } from 'axios'
import type {
  Card,
  MatchedUser,
  Skill,
  SwipePayload,
  SwipeResult,
  User,
  UserSkillsUpdate,
} from '../types'

// ВАЖЛИВО для Telegram Mini App: Telegram WebView вимагає HTTPS і блокує
// "mixed content" — запити з https-сторінки на http-адресу.
//
// РІШЕННЯ: використовуємо відносний шлях '/api' замість абсолютного URL.
// Vite dev-сервер має proxy для '/api' -> http://localhost:8000 (див.
// vite.config.ts), тож браузер бачить запит як same-origin відносно
// сторінки (того самого ngrok/cloudflare https-тунелю) — взагалі без
// CORS і без mixed content, і без потреби піднімати окремий тунель
// для backend.
//
// У prod-збірці (Nginx) той самий відносний шлях '/api' має проксуватись
// на backend-контейнер — див. nginx.conf.
const BASE_URL = '/api'

// ─────────────────────────────────────────────────────────────────────────────
// ВАЖЛИВО (production-автентифікація):
// Раніше ApiService приймав числовий userId і підкладав його в query-параметр
// (?current_user_id=1) — будь-хто міг відкрити DevTools і підставити чужий id.
//
// Тепер ApiService приймає СИРИЙ рядок window.Telegram.WebApp.initData і
// передає його в заголовку X-Telegram-Init-Data. Backend сам перевіряє
// HMAC-підпис цього рядка (app/core/telegram_auth.py) і витягує справжній
// telegram_id — підмінити його з консолі браузера неможливо без BOT_TOKEN.
//
// Реєстрація юзера прибрана звідси повністю: юзер створюється тільки
// командою /start у боті (UPSERT в app/bot/handlers.py). Якщо хтось
// відкриє Mini App без попереднього /start — backend поверне 403 з
// поясненням, фронтенд показує екран "Напишіть /start боту".
// ─────────────────────────────────────────────────────────────────────────────

function createApiClient(initData: string): AxiosInstance {
  const client = axios.create({
    baseURL: BASE_URL,
    timeout: 10_000,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData,
    },
  })

  client.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error.response?.status
      const detail = error.response?.data?.detail ?? 'Невідома помилка'
      console.error(`[API] ${status ?? 'Network error'}: ${detail}`)
      return Promise.reject(error)
    },
  )

  return client
}

export class ApiService {
  private client: AxiosInstance

  constructor(initData: string) {
    this.client = createApiClient(initData)
  }

  async getMe(): Promise<User> {
    const response = await this.client.get<User>('/users/me')
    return response.data
  }

  async updateSkills(payload: UserSkillsUpdate): Promise<User> {
    const response = await this.client.post<User>('/users/skills', payload)
    return response.data
  }

  async getSkillsList(): Promise<Skill[]> {
    const response = await this.client.get<Skill[]>('/users/skills-list')
    return response.data
  }

  async getNextCard(): Promise<Card | null> {
    try {
      const response = await this.client.get<Card>('/cards/next')
      return response.data
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null
      }
      throw error
    }
  }

  async swipe(payload: SwipePayload): Promise<SwipeResult> {
    const response = await this.client.post<SwipeResult>('/cards/swipe', payload)
    return response.data
  }

  /** Список взаємних матчів поточного юзера */
  async getMatches(): Promise<MatchedUser[]> {
    const response = await this.client.get<MatchedUser[]>('/cards/matches')
    return response.data
  }
}

let _apiInstance: ApiService | null = null

/**
 * Ініціалізує глобальний ApiService сирим рядком initData.
 * Викликається один раз з TelegramContext, щойно SDK готовий.
 */
export function initApi(initData: string): ApiService {
  _apiInstance = new ApiService(initData)
  return _apiInstance
}

export function getApi(): ApiService {
  if (!_apiInstance) {
    throw new Error('API не ініціалізовано. Викличте initApi(initData) після готовності Telegram SDK.')
  }
  return _apiInstance
}
