// =============================================================================
// src/pages/Matches.tsx
//
// Екран взаємних матчів SkillSwap (Крок 3.4).
//
// Логіка:
//   1. getApi().getMatches() при монтуванні
//   2. Skeleton поки завантаження
//   3. Empty state якщо матчів немає
//   4. Список карток матчів з offers/seeks тегами
//   5. Кнопка "Написати в Telegram" через webApp.openTelegramLink()
//   6. NavBar для навігації
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTelegram } from '../context/TelegramContext'
import { getApi } from '../services/api'
import type { MatchedUser } from '../types'

// =============================================================================
// NavBar — той самий що в Home та Profile
// =============================================================================

function NavBar() {
  const navigate = useNavigate()

  const tabs = [
    { path: '/',        emoji: '🏠', label: 'Головна' },
    { path: '/profile', emoji: '👤', label: 'Профіль' },
    { path: '/matches', emoji: '🤝', label: 'Матчі' },
  ]

  return (
    <nav className="sticky bottom-0 bg-tg-bg border-t border-gray-100 flex pb-safe z-10">
      {tabs.map((tab) => {
        const isActive = window.location.pathname === tab.path
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={[
              'flex-1 flex flex-col items-center gap-1 py-3 transition-colors',
              isActive ? 'text-brand-primary' : 'text-tg-hint hover:text-tg-text',
            ].join(' ')}
          >
            <span className="text-xl">{tab.emoji}</span>
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

// =============================================================================
// Skeleton одного матч-рядка
// =============================================================================

function MatchCardSkeleton() {
  return (
    <div className="bg-white rounded-3xl p-4 shadow-sm animate-pulse space-y-3">
      {/* Аватар + ім'я */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded-full w-32" />
          <div className="h-3 bg-gray-100 rounded-full w-20" />
        </div>
        <div className="w-28 h-9 bg-gray-100 rounded-2xl flex-shrink-0" />
      </div>
      {/* Bio */}
      <div className="space-y-1.5 pl-15">
        <div className="h-3 bg-gray-100 rounded-full w-full" />
        <div className="h-3 bg-gray-100 rounded-full w-4/5" />
      </div>
      {/* Теги */}
      <div className="flex gap-2">
        <div className="h-6 w-16 bg-gray-100 rounded-full" />
        <div className="h-6 w-20 bg-gray-100 rounded-full" />
        <div className="h-6 w-14 bg-gray-100 rounded-full" />
      </div>
    </div>
  )
}

function MatchesListSkeleton() {
  return (
    <div className="space-y-3 px-4 py-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <MatchCardSkeleton key={i} />
      ))}
    </div>
  )
}

// =============================================================================
// Empty State
// =============================================================================

function EmptyState({ onFindPartners }: { onFindPartners: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-5">
      {/* Іконка */}
      <div className="relative">
        <div className="w-28 h-28 rounded-full bg-brand-primary/10 flex items-center justify-center">
          <span className="text-6xl">🤝</span>
        </div>
        {/* Декоративні кружечки */}
        <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-brand-secondary/30" />
        <div className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-brand-primary/20" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold text-brand-dark">
          Поки немає матчів
        </h2>
        <p className="text-tg-hint text-sm leading-relaxed max-w-xs">
          Свайпай картки на головній — і як тільки хтось лайкне тебе у відповідь,
          з'явиться тут!
        </p>
      </div>

      <button
        onClick={onFindPartners}
        className="px-7 py-3.5 bg-brand-primary text-white font-semibold rounded-2xl shadow-lg shadow-brand-primary/30 active:scale-[0.97] transition-transform"
      >
        🔄 Знайти партнерів
      </button>
    </div>
  )
}

// =============================================================================
// Картка одного матчу
// =============================================================================

interface MatchCardProps {
  match: MatchedUser
  onWrite: (match: MatchedUser) => void
}

function MatchCard({ match, onWrite }: MatchCardProps) {
  const avatarLetter = match.first_name[0]?.toUpperCase() ?? '?'
  const displayName  = match.username ? `@${match.username}` : match.first_name
  const hasUsername  = Boolean(match.username)

  return (
    <article className="bg-white rounded-3xl shadow-sm overflow-hidden border border-gray-50">

      {/* Верхня секція — аватар, ім'я, кнопка */}
      <div className="flex items-center gap-3 p-4">

        {/* Аватар */}
        <div className="w-12 h-12 rounded-full bg-brand-primary flex items-center justify-center flex-shrink-0 shadow-sm">
          <span className="text-white font-bold text-lg">{avatarLetter}</span>
        </div>

        {/* Ім'я */}
        <div className="flex-1 min-w-0">
          <p className="text-tg-text font-semibold text-base leading-tight truncate">
            {displayName}
          </p>
          {match.username && (
            <p className="text-tg-hint text-xs truncate">{match.first_name}</p>
          )}
          {/* Рейтинг */}
          <p className="text-tg-hint text-xs mt-0.5">
            ⭐️ {match.rating.toFixed(1)} · 🪙 {Math.floor(match.karma_balance)}
          </p>
        </div>

        {/* Кнопка "Написати" */}
        <button
          onClick={() => onWrite(match)}
          disabled={!hasUsername}
          title={hasUsername ? undefined : 'У цього юзера немає username'}
          className={[
            'flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-2xl text-sm font-semibold',
            'transition-all active:scale-95',
            hasUsername
              ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/25 hover:bg-brand-primary/90'
              : 'bg-gray-100 text-gray-300 cursor-not-allowed',
          ].join(' ')}
        >
          <span>💬</span>
          <span>Написати</span>
        </button>
      </div>

      {/* Bio */}
      {match.bio && (
        <div className="px-4 pb-3">
          <p className="text-tg-hint text-sm leading-relaxed line-clamp-2">
            {match.bio}
          </p>
        </div>
      )}

      {/* Навички */}
      {(match.offers.length > 0 || match.seeks.length > 0) && (
        <div className="px-4 pb-4 space-y-2 border-t border-gray-50 pt-3">

          {/* Offers */}
          {match.offers.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-gray-300 mt-1 flex-shrink-0">✅</span>
              <div className="flex flex-wrap gap-1.5">
                {match.offers.map((skill) => (
                  <span
                    key={skill}
                    className="bg-brand-primary/10 text-brand-primary text-xs font-medium px-2 py-0.5 rounded-full"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Seeks */}
          {match.seeks.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-gray-300 mt-1 flex-shrink-0">🔍</span>
              <div className="flex flex-wrap gap-1.5">
                {match.seeks.map((skill) => (
                  <span
                    key={skill}
                    className="bg-brand-secondary/10 text-brand-secondary text-xs font-medium px-2 py-0.5 rounded-full"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

// =============================================================================
// Головний компонент Matches
// =============================================================================

type LoadState = 'loading' | 'success' | 'error'

export default function Matches() {
  const { webApp }  = useTelegram()
  const navigate    = useNavigate()

  // ── Стан ──────────────────────────────────────────────────────────────────
  const [matches, setMatches]   = useState<MatchedUser[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')

  // ── Завантаження матчів ────────────────────────────────────────────────────
  const loadMatches = useCallback(async () => {
    setLoadState('loading')
    try {
      const data = await getApi().getMatches()
      setMatches(data)
      setLoadState('success')
    } catch (err) {
      console.error('[Matches] Помилка завантаження:', err)
      setLoadState('error')
    }
  }, [])

  useEffect(() => {
    loadMatches()
  }, [loadMatches])

  // ── Кнопка "Написати в Telegram" ──────────────────────────────────────────
  const handleWrite = useCallback((match: MatchedUser) => {
    if (!match.username) return

    webApp?.HapticFeedback.impactOccurred('light')

    // openTelegramLink відкриває чат нативно всередині Telegram
    // В браузері (dev-mode) webApp буде null — відкриємо у новій вкладці
    if (webApp) {
      webApp.openTelegramLink(`https://t.me/${match.username}`)
    } else {
      window.open(`https://t.me/${match.username}`, '_blank')
    }
  }, [webApp])

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="min-h-screen bg-tg-bg flex flex-col">

      {/* Хедер */}
      <div className="bg-tg-secondary px-4 pt-6 pb-4 flex-shrink-0">
        <h1 className="text-tg-text text-xl font-bold">Мої матчі</h1>
        <p className="text-tg-hint text-xs mt-0.5">
          {loadState === 'success' && matches.length > 0
            ? `${matches.length} взаємних збігів`
            : 'Взаємні лайки'}
        </p>
      </div>

      {/* Контент */}
      <main className="flex-1 overflow-y-auto flex flex-col">

        {loadState === 'loading' && (
          <MatchesListSkeleton />
        )}

        {loadState === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <span className="text-4xl">😕</span>
            <p className="text-tg-hint text-sm">
              Не вдалося завантажити матчі
            </p>
            <button
              onClick={loadMatches}
              className="px-5 py-2.5 bg-brand-primary text-white rounded-2xl text-sm font-semibold active:scale-95 transition-transform"
            >
              Спробувати знову
            </button>
          </div>
        )}

        {loadState === 'success' && matches.length === 0 && (
          <EmptyState onFindPartners={() => navigate('/')} />
        )}

        {loadState === 'success' && matches.length > 0 && (
          <ul className="space-y-3 px-4 py-4">
            {matches.map((match) => (
              <li key={match.id}>
                <MatchCard match={match} onWrite={handleWrite} />
              </li>
            ))}

            {/* Підказка внизу списку */}
            <li className="text-center pt-2 pb-1">
              <p className="text-tg-hint text-xs">
                🔄 Свайпай далі — нові матчі з'являться тут
              </p>
            </li>
          </ul>
        )}

      </main>

      <NavBar />
    </div>
  )
}
