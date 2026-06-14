// =============================================================================
// src/services/api.ts
//
// Централізований модуль для HTTP-запитів до SkillSwap бекенду.
// Всі запити йдуть через один axios-інстанс з базовим URL та
// автоматичним додаванням current_user_id через interceptor.
// =============================================================================

import axios, { type AxiosInstance } from 'axios'
import type { Card, Skill, SwipePayload, SwipeResult, User, UserSkillsUpdate } from '../types'

// Базовий URL бекенду — при розробці проксюється через vite.config.ts
// В продакшні замінити на реальну адресу: https://your-ec2-ip:8000
const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

// -----------------------------------------------------------------------------
// Фабрика axios-інстансу
// Приймає userId щоб автоматично додавати current_user_id до кожного запиту
// -----------------------------------------------------------------------------

function createApiClient(userId: number): AxiosInstance {
  const client = axios.create({
    baseURL: BASE_URL,
    timeout: 10_000,
    headers: {
      'Content-Type': 'application/json',
    },
  })

  // Interceptor: додаємо current_user_id до всіх запитів як query-param
  client.interceptors.request.use((config) => {
    config.params = { ...config.params, current_user_id: userId }
    return config
  })

  // Interceptor: централізована обробка помилок
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error.response?.status
      const detail = error.response?.data?.detail ?? 'Невідома помилка'

      console.error(`[API] ${status ?? 'Network error'}: ${detail}`)

      // Пробрасуємо далі щоб компоненти могли обробляти специфічні коди
      return Promise.reject(error)
    },
  )

  return client
}

// -----------------------------------------------------------------------------
// Клас ApiService — всі методи бекенду в одному місці
// -----------------------------------------------------------------------------

export class ApiService {
  private client: AxiosInstance

  constructor(userId: number) {
    this.client = createApiClient(userId)
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  /** Реєстрація або оновлення юзера (upsert за telegram_id) */
  async registerUser(data: {
    telegram_id: number
    username?: string
    first_name: string
    bio?: string
  }): Promise<User> {
    // Запит іде на /api/users/ — current_user_id НЕ потрібен для реєстрації
    const client = axios.create({ baseURL: BASE_URL, timeout: 10_000 })
    const response = await client.post<User>('/users/', data)
    return response.data
  }

  /** Профіль поточного юзера з навичками */
  async getMe(): Promise<User> {
    const response = await this.client.get<User>('/users/me')
    return response.data
  }

  /** Оновлення навичок (bulk replace) */
  async updateSkills(payload: UserSkillsUpdate): Promise<User> {
    const response = await this.client.post<User>('/users/skills', payload)
    return response.data
  }

  /** Список всіх доступних навичок для пікера */
  async getSkillsList(): Promise<Skill[]> {
    const response = await this.client.get<Skill[]>('/users/skills-list')
    return response.data
  }

  // ── Cards ──────────────────────────────────────────────────────────────────

  /** Наступна картка для свайпу */
  async getNextCard(): Promise<Card | null> {
    try {
      const response = await this.client.get<Card>('/cards/next')
      return response.data
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        // 404 = колода вичерпана, це нормальна ситуація
        return null
      }
      throw error
    }
  }

  /** Зафіксувати свайп */
  async swipe(payload: SwipePayload): Promise<SwipeResult> {
    const response = await this.client.post<SwipeResult>('/cards/swipe', payload)
    return response.data
  }
}

// -----------------------------------------------------------------------------
// Синглтон — ініціалізується після отримання userId з TelegramContext
// -----------------------------------------------------------------------------

let _apiInstance: ApiService | null = null

export function initApi(userId: number): ApiService {
  _apiInstance = new ApiService(userId)
  return _apiInstance
}

export function getApi(): ApiService {
  if (!_apiInstance) {
    throw new Error(
      'API не ініціалізовано. Викличте initApi(userId) після отримання telegram_id.',
    )
  }
  return _apiInstance
}
