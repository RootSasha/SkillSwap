// =============================================================================
// src/pages/Home.tsx
//
// Головна сторінка — свайп-колода кандидатів (Крок 3.3).
//
// Залежність: npm install react-tinder-card
// Власні типи вбудовані в пакет — окремо @types не потрібен.
//
// Логіка:
//   1. getNextCard() при монтуванні та після кожного свайпу
//   2. TinderCard обгортає картку, onSwipe → swipe()
//   3. Match overlay при match: true
//   4. Empty state при null від getNextCard()
//   5. Кнопки лайк/дизлайк для тих хто не хоче свайпати жестами
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import TinderCard from 'react-tinder-card'
import { useNavigate } from 'react-router-dom'
import { useTelegram } from '../context/TelegramContext'
import { getApi } from '../services/api'
import type { Card } from '../types'

// =============================================================================
// Типи
// =============================================================================

type SwipeDirection = 'left' | 'right' | 'up' | 'down'

interface MatchInfo {
  matchedUserId: number
}

// =============================================================================
// Навбар (той самий що в Profile.tsx)
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
// Картка кандидата
// =============================================================================

interface CandidateCardProps {
  card: Card
  // Напрям поточного drag-у для візуального індикатора
  dragDirection: SwipeDirection | null
}

function CandidateCard({ card, dragDirection }: CandidateCardProps) {
  const avatarLetter = card.first_name[0]?.toUpperCase() ?? '?'
  const displayName  = card.username ? `@${card.username}` : card.first_name

  // Відтінок overlay залежно від напряму свайпу
  const overlayClass =
    dragDirection === 'right'
      ? 'bg-green-400/20 border-green-400'
      : dragDirection === 'left'
      ? 'bg-red-400/20 border-red-400'
      : 'bg-transparent border-transparent'

  return (
    <div
      className={[
        'w-full h-full bg-white rounded-3xl shadow-2xl flex flex-col',
        'border-4 transition-colors duration-100 select-none overflow-hidden',
        overlayClass,
      ].join(' ')}
    >
      {/* Верхня кольорова зона з аватаром */}
      <div className="bg-gradient-to-br from-brand-primary to-brand-secondary p-6 flex flex-col items-center gap-3 flex-shrink-0">
        {/* Аватар */}
        <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center border-4 border-white/40 shadow-inner">
          <span className="text-white text-3xl font-bold">{avatarLetter}</span>
        </div>

        {/* Ім'я */}
        <div className="text-center">
          <h2 className="text-white font-bold text-xl leading-tight">{displayName}</h2>
          {card.username && (
            <p className="text-white/70 text-sm">{card.first_name}</p>
          )}
        </div>

        {/* Рейтинг і карма */}
        <div className="flex gap-4">
          <span className="bg-white/20 text-white text-xs font-medium px-3 py-1 rounded-full">
            ⭐️ {card.rating.toFixed(1)}
          </span>
          <span className="bg-white/20 text-white text-xs font-medium px-3 py-1 rounded-full">
            🪙 {Math.floor(card.karma_balance)}
          </span>
        </div>
      </div>

      {/* Скролюємий контент */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {/* Bio */}
        {card.bio && (
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Про себе</p>
            <p className="text-gray-700 text-sm leading-relaxed">{card.bio}</p>
          </div>
        )}

        {/* Offers */}
        {card.offers.length > 0 && (
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-widest mb-2">
              ✅ Може навчити
            </p>
            <div className="flex flex-wrap gap-1.5">
              {card.offers.map((skill) => (
                <span
                  key={skill}
                  className="bg-brand-primary/10 text-brand-primary text-xs font-medium px-2.5 py-1 rounded-full"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Seeks */}
        {card.seeks.length > 0 && (
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-widest mb-2">
              🔍 Хоче вивчити
            </p>
            <div className="flex flex-wrap gap-1.5">
              {card.seeks.map((skill) => (
                <span
                  key={skill}
                  className="bg-brand-secondary/10 text-brand-secondary text-xs font-medium px-2.5 py-1 rounded-full"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Якщо немає ні bio ні навичок */}
        {!card.bio && card.offers.length === 0 && card.seeks.length === 0 && (
          <p className="text-gray-300 text-sm text-center py-4">
            Профіль ще не заповнений
          </p>
        )}
      </div>

      {/* Підказки свайпу */}
      <div className="flex justify-between items-center px-6 py-3 border-t border-gray-50 flex-shrink-0">
        <span className="text-xs text-gray-300 flex items-center gap-1">
          ← Дизлайк
        </span>
        <span className="text-xs text-gray-300">свайп</span>
        <span className="text-xs text-gray-300 flex items-center gap-1">
          Лайк →
        </span>
      </div>
    </div>
  )
}

// =============================================================================
// Match Overlay
// =============================================================================

interface MatchOverlayProps {
  onGoToMatches: () => void
  onContinue: () => void
}

function MatchOverlay({ onGoToMatches, onContinue }: MatchOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl p-8 w-full max-w-sm text-center shadow-2xl animate-slide-up">

        {/* Анімована іконка */}
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary mx-auto flex items-center justify-center shadow-lg">
            <span className="text-5xl">🎉</span>
          </div>
          {/* Пульсуюче кільце */}
          <div className="absolute inset-0 rounded-full border-4 border-brand-primary/30 animate-ping" />
        </div>

        <h2 className="text-2xl font-bold text-brand-dark mb-2">
          Взаємний Матч!
        </h2>
        <p className="text-gray-500 text-sm leading-relaxed mb-8">
          Ви обидва зацікавлені у співпраці.{'\n'}
          Час познайомитися ближче!
        </p>

        {/* Кнопки */}
        <div className="space-y-3">
          <button
            onClick={onGoToMatches}
            className="w-full py-3.5 bg-brand-primary text-white font-semibold rounded-2xl shadow-lg shadow-brand-primary/30 active:scale-[0.98] transition-transform"
          >
            🤝 Перейти до Матчів
          </button>
          <button
            onClick={onContinue}
            className="w-full py-3 bg-gray-100 text-gray-600 font-medium rounded-2xl active:scale-[0.98] transition-transform"
          >
            Продовжити свайпи
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Empty State — всі картки переглянуто
// =============================================================================

function EmptyState({ onGoToProfile }: { onGoToProfile: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="mb-6">
        <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <span className="text-5xl">🎯</span>
        </div>
        <h2 className="text-xl font-bold text-brand-dark mb-2">
          Ти переглянув усіх!
        </h2>
        <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
          Наразі більше кандидатів немає. Спробуй оновити свої навички у профілі
          — це допоможе знайти нових збігів.
        </p>
      </div>
      <button
        onClick={onGoToProfile}
        className="px-6 py-3 bg-brand-primary text-white font-semibold rounded-2xl shadow-lg shadow-brand-primary/30 active:scale-[0.98] transition-transform"
      >
        👤 Оновити профіль
      </button>
    </div>
  )
}

// =============================================================================
// Лоадер картки
// =============================================================================

function CardLoader() {
  return (
    <div className="w-full h-full bg-white rounded-3xl shadow-2xl animate-pulse flex flex-col overflow-hidden">
      {/* Шапка */}
      <div className="bg-gray-200 h-48 flex-shrink-0" />
      <div className="p-5 space-y-4 flex-1">
        <div className="h-4 bg-gray-200 rounded-full w-3/4 mx-auto" />
        <div className="h-3 bg-gray-100 rounded-full w-1/2 mx-auto" />
        <div className="space-y-2 mt-4">
          <div className="h-3 bg-gray-100 rounded-full w-full" />
          <div className="h-3 bg-gray-100 rounded-full w-5/6" />
          <div className="h-3 bg-gray-100 rounded-full w-4/6" />
        </div>
        <div className="flex gap-2 flex-wrap mt-2">
          {[1,2,3].map(i => (
            <div key={i} className="h-6 w-16 bg-gray-100 rounded-full" />
          ))}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Головний компонент Home
// =============================================================================

export default function Home() {
  const { webApp } = useTelegram()
  const navigate   = useNavigate()

  // ── Стан ────────────────────────────────────────────────────────────────────
  const [card, setCard]           = useState<Card | null | 'loading'>('loading')
  const [isDeckEmpty, setIsDeckEmpty] = useState(false)
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null)
  const [isSwiping, setIsSwiping] = useState(false)
  const [dragDir, setDragDir]     = useState<SwipeDirection | null>(null)

  // Ref для програмного свайпу через кнопки
  const cardRef = useRef<{ swipe: (dir: SwipeDirection) => Promise<void> } | null>(null)

  // ── Завантаження картки ──────────────────────────────────────────────────────
  const loadNextCard = useCallback(async () => {
    setCard('loading')
    setDragDir(null)
    try {
      const next = await getApi().getNextCard()
      if (next === null) {
        setIsDeckEmpty(true)
        setCard(null)
      } else {
        setIsDeckEmpty(false)
        setCard(next)
      }
    } catch (err) {
      console.error('[Home] Помилка завантаження картки:', err)
      setCard(null)
    }
  }, [])

  useEffect(() => {
    loadNextCard()
  }, [loadNextCard])

  // ── Обробка свайпу ───────────────────────────────────────────────────────────
  const handleSwipe = useCallback(
    async (direction: SwipeDirection, swipedCard: Card) => {
      if (isSwiping) return
      setIsSwiping(true)

      const isLike = direction === 'right'

      // Тактильний відгук
      webApp?.HapticFeedback.impactOccurred('medium')

      try {
        const result = await getApi().swipe({
          to_user_id: swipedCard.id,
          is_like: isLike,
        })

        if (result.match && result.matched_user_id !== null) {
          webApp?.HapticFeedback.notificationOccurred('success')
          setMatchInfo({ matchedUserId: result.matched_user_id })
        }
      } catch (err) {
        console.error('[Home] Помилка свайпу:', err)
      } finally {
        setIsSwiping(false)
      }
    },
    [isSwiping, webApp],
  )

  // onCardLeftScreen — викликається після завершення анімації виходу картки
  const handleCardLeft = useCallback(
    (_direction: SwipeDirection) => {
      // Завантажуємо наступну тільки якщо матч-оверлей не відкритий
      // (якщо відкритий — завантажимо після закриття у handleContinue)
      if (!matchInfo) {
        loadNextCard()
      }
    },
    [matchInfo, loadNextCard],
  )

  // ── Кнопки лайк/дизлайк ─────────────────────────────────────────────────────
  const triggerSwipe = useCallback(
    async (direction: SwipeDirection) => {
      if (cardRef.current && card && card !== 'loading') {
        await cardRef.current.swipe(direction)
      }
    },
    [card],
  )

  // ── Match overlay дії ────────────────────────────────────────────────────────
  const handleGoToMatches = useCallback(() => {
    setMatchInfo(null)
    navigate('/matches')
  }, [navigate])

  const handleContinue = useCallback(() => {
    setMatchInfo(null)
    loadNextCard()
  }, [loadNextCard])

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="min-h-screen bg-tg-bg flex flex-col">

      {/* Match Overlay */}
      {matchInfo && (
        <MatchOverlay
          onGoToMatches={handleGoToMatches}
          onContinue={handleContinue}
        />
      )}

      {/* Хедер */}
      <div className="px-4 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-tg-text text-xl font-bold">SkillSwap</h1>
            <p className="text-tg-hint text-xs">Знайди свого партнера</p>
          </div>
          {/* Індикатор статусу */}
          {card !== 'loading' && card !== null && !isDeckEmpty && (
            <div className="flex gap-2 text-xs text-tg-hint items-center">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Свайп активний
            </div>
          )}
        </div>
      </div>

      {/* Основна зона */}
      <main className="flex-1 flex flex-col px-4 pb-4 min-h-0">

        {isDeckEmpty ? (
          // Колода вичерпана
          <EmptyState onGoToProfile={() => navigate('/profile')} />

        ) : card === 'loading' ? (
          // Завантаження
          <div className="flex-1 relative" style={{ maxHeight: 520 }}>
            <CardLoader />
          </div>

        ) : card !== null ? (
          // Картка + кнопки
          <>
            {/* Зона картки */}
            <div className="flex-1 relative" style={{ maxHeight: 520 }}>
              <TinderCard
                ref={cardRef}
                key={card.id}
                onSwipe={(dir) => handleSwipe(dir as SwipeDirection, card)}
                onCardLeftScreen={(dir) => handleCardLeft(dir as SwipeDirection)}
                preventSwipe={['up', 'down']}
                swipeRequirementType="position"
                swipeThreshold={80}
                className="absolute inset-0"
              >
                {/* Обгортка потрібна — TinderCard очікує один дочірній елемент */}
                <div
                  className="w-full h-full cursor-grab active:cursor-grabbing"
                  onMouseEnter={() => setDragDir(null)}
                >
                  <CandidateCard card={card} dragDirection={dragDir} />
                </div>
              </TinderCard>
            </div>

            {/* Кнопки дії */}
            <div className="flex justify-center items-center gap-6 pt-4 flex-shrink-0">
              {/* Дизлайк */}
              <button
                onClick={() => triggerSwipe('left')}
                disabled={isSwiping}
                className={[
                  'w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center',
                  'text-2xl border-2 border-red-100',
                  'active:scale-90 transition-transform',
                  isSwiping ? 'opacity-50 cursor-not-allowed' : 'hover:border-red-300',
                ].join(' ')}
                aria-label="Дизлайк"
              >
                ❌
              </button>

              {/* Суперлайк (опційно — вгору) */}
              <button
                onClick={() => triggerSwipe('up')}
                disabled={isSwiping}
                className={[
                  'w-12 h-12 rounded-full bg-white shadow-md flex items-center justify-center',
                  'text-xl border-2 border-yellow-100',
                  'active:scale-90 transition-transform',
                  isSwiping ? 'opacity-50 cursor-not-allowed' : 'hover:border-yellow-300',
                ].join(' ')}
                aria-label="Суперлайк"
              >
                ⭐️
              </button>

              {/* Лайк */}
              <button
                onClick={() => triggerSwipe('right')}
                disabled={isSwiping}
                className={[
                  'w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center',
                  'text-2xl border-2 border-green-100',
                  'active:scale-90 transition-transform',
                  isSwiping ? 'opacity-50 cursor-not-allowed' : 'hover:border-green-300',
                ].join(' ')}
                aria-label="Лайк"
              >
                💚
              </button>
            </div>
          </>
        ) : (
          // card === null і не isDeckEmpty — помилка завантаження
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <span className="text-4xl">😕</span>
            <p className="text-tg-hint text-sm text-center">
              Не вдалося завантажити картку
            </p>
            <button
              onClick={loadNextCard}
              className="px-5 py-2.5 bg-brand-primary text-white rounded-2xl text-sm font-medium"
            >
              Спробувати знову
            </button>
          </div>
        )}
      </main>

      <NavBar />
    </div>
  )
}
