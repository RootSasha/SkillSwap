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

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

function createApiClient(userId: number): AxiosInstance {
  const client = axios.create({
    baseURL: BASE_URL,
    timeout: 10_000,
    headers: { 'Content-Type': 'application/json' },
  })

  client.interceptors.request.use((config) => {
    config.params = { ...config.params, current_user_id: userId }
    return config
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

  constructor(userId: number) {
    this.client = createApiClient(userId)
  }

  async registerUser(data: {
    telegram_id: number
    username?: string
    first_name: string
    bio?: string
  }): Promise<User> {
    const client = axios.create({ baseURL: BASE_URL, timeout: 10_000 })
    const response = await client.post<User>('/users/', data)
    return response.data
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

export function initApi(userId: number): ApiService {
  _apiInstance = new ApiService(userId)
  return _apiInstance
}

export function getApi(): ApiService {
  if (!_apiInstance) {
    throw new Error('API не ініціалізовано. Викличте initApi(userId) після отримання telegram_id.')
  }
  return _apiInstance
}
