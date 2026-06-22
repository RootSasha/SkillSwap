// =============================================================================
// src/pages/Profile.tsx
//
// Екран профілю користувача SkillSwap.
//
// Логіка:
//   1. Паралельний fetch: getMe() + getSkillsList()
//   2. Textarea для bio з лічильником символів
//   3. Два пікери тегів: Offers (фіолетовий) та Seeks (рожевий)
//   4. Збереження через updateSkills()
//   5. Skeleton-лоадер під час завантаження
//   6. Навбар для навігації
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTelegram } from '../context/TelegramContext'
import { getApi } from '../services/api'
import type { Skill, User } from '../types'

// Максимальна довжина bio — відповідає обмеженню на бекенді
const BIO_MAX_LENGTH = 1024

// =============================================================================
// Skeleton-компоненти
// =============================================================================

function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-gray-200 rounded-2xl animate-pulse ${className}`} />
  )
}

function ProfileSkeleton() {
  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center gap-4 px-1">
        <SkeletonBlock className="w-16 h-16 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-5 w-32" />
          <SkeletonBlock className="h-3 w-20" />
        </div>
      </div>
      <SkeletonBlock className="h-24 w-full" />
      <div className="space-y-3">
        <SkeletonBlock className="h-4 w-40" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <SkeletonBlock className="h-4 w-48" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
      </div>
      <SkeletonBlock className="h-12 w-full rounded-2xl" />
    </div>
  )
}

// =============================================================================
// Пікер тегів навичок
// =============================================================================

interface SkillPickerProps {
  label: string
  emoji: string
  description: string
  allSkills: Skill[]
  selectedIds: Set<number>
  disabledIds: Set<number>
  activeColor: 'purple' | 'pink'
  onToggle: (skillId: number) => void
}

function SkillPicker({
  label,
  emoji,
  description,
  allSkills,
  selectedIds,
  disabledIds,
  activeColor,
  onToggle,
}: SkillPickerProps) {
  const activeClass =
    activeColor === 'purple'
      ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/30'
      : 'bg-brand-secondary text-white shadow-md shadow-brand-secondary/30'

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-tg-text font-semibold text-base">
          {emoji} {label}
        </h3>
        <p className="text-tg-hint text-xs mt-0.5">{description}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {allSkills.map((skill) => {
          const isSelected = selectedIds.has(skill.id)
          const isDisabled = disabledIds.has(skill.id)

          return (
            <button
              key={skill.id}
              type="button"
              disabled={isDisabled}
              onClick={() => !isDisabled && onToggle(skill.id)}
              className={[
                'px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150',
                'border select-none',
                isSelected
                  ? activeClass + ' border-transparent'
                  : 'bg-tg-secondary text-tg-text border-gray-200 active:scale-95',
                isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              {skill.name}
            </button>
          )
        })}
      </div>

      {selectedIds.size > 0 && (
        <p className="text-xs text-tg-hint">Обрано: {selectedIds.size}</p>
      )}
    </section>
  )
}

// =============================================================================
// Навбар
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
// Тост-повідомлення
// =============================================================================

type ToastType = 'success' | 'error'

interface ToastState {
  message: string
  type: ToastType
}

function Toast({ message, type }: ToastState) {
  return (
    <div
      className={[
        'fixed top-4 left-1/2 -translate-x-1/2 z-50',
        'text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-lg',
        'animate-slide-up whitespace-nowrap',
        type === 'success' ? 'bg-green-500' : 'bg-red-500',
      ].join(' ')}
    >
      {type === 'success' ? '✅ ' : '❌ '}{message}
    </div>
  )
}

// =============================================================================
// Головний компонент Profile
// =============================================================================

type SaveStatus = 'idle' | 'saving' | 'success' | 'error'

export default function Profile() {
  const { tgUser, webApp } = useTelegram()

  // ── Стан даних ──────────────────────────────────────────────────────────────
  const [user, setUser]           = useState<User | null>(null)
  const [allSkills, setAllSkills] = useState<Skill[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ── Стан форми ──────────────────────────────────────────────────────────────
  const [bio, setBio]               = useState('')
  const [offerIds, setOfferIds]     = useState<Set<number>>(new Set())
  const [seekIds, setSeekIds]       = useState<Set<number>>(new Set())
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [toast, setToast]           = useState<ToastState | null>(null)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Показ тосту ─────────────────────────────────────────────────────────────
  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  // ── Початкове завантаження даних ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function loadData() {
      try {
        setIsLoading(true)
        setLoadError(null)

        // Два паралельних запити — не чекаємо одного щоб почати другий
        const [userData, skillsData] = await Promise.all([
          getApi().getMe(),
          getApi().getSkillsList(),
        ])

        if (cancelled) return

        setUser(userData)
        setAllSkills(skillsData)

        // Заповнюємо форму поточними даними юзера
        setBio(userData.bio ?? '')
        setOfferIds(new Set(userData.offers.map((s) => s.id)))
        setSeekIds(new Set(userData.seeks.map((s) => s.id)))
      } catch (err) {
        if (cancelled) return
        console.error('[Profile] Помилка завантаження:', err)
        setLoadError('Не вдалося завантажити дані. Спробуй ще раз.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadData()
    return () => { cancelled = true }
  }, [])

  // ── Очищення таймера при розмонтуванні ──────────────────────────────────────
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  // ── Тогл навичок ────────────────────────────────────────────────────────────
  const toggleOffer = useCallback((skillId: number) => {
    webApp?.HapticFeedback.impactOccurred('light')
    setOfferIds((prev) => {
      const next = new Set(prev)
      next.has(skillId) ? next.delete(skillId) : next.add(skillId)
      return next
    })
  }, [webApp])

  const toggleSeek = useCallback((skillId: number) => {
    webApp?.HapticFeedback.impactOccurred('light')
    setSeekIds((prev) => {
      const next = new Set(prev)
      next.has(skillId) ? next.delete(skillId) : next.add(skillId)
      return next
    })
  }, [webApp])

  // ── Збереження профілю ───────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (saveStatus === 'saving') return

    // Валідація: один скіл не може бути одночасно offer і seek
    const overlap = [...offerIds].filter((id) => seekIds.has(id))
    if (overlap.length > 0) {
      const names = allSkills
        .filter((s) => overlap.includes(s.id))
        .map((s) => s.name)
        .join(', ')
      showToast(`Конфлікт: "${names}" і в Offer і в Seek`, 'error')
      return
    }

    setSaveStatus('saving')

    try {
      await getApi().updateSkills({
        offers: [...offerIds],
        seeks:  [...seekIds],
      })

      webApp?.HapticFeedback.notificationOccurred('success')
      setSaveStatus('success')
      showToast('Профіль збережено!', 'success')
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (err) {
      console.error('[Profile] Помилка збереження:', err)
      webApp?.HapticFeedback.notificationOccurred('error')
      setSaveStatus('error')
      showToast('Помилка збереження. Спробуй ще раз.', 'error')
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }, [saveStatus, offerIds, seekIds, allSkills, webApp, showToast])

  // ── Відображення ─────────────────────────────────────────────────────────────
  const avatarLetter = (tgUser?.first_name ?? user?.first_name ?? '?')[0].toUpperCase()
  const displayName  = tgUser?.username
    ? `@${tgUser.username}`
    : (user?.first_name ?? 'Користувач')

  // ── Текст і стиль кнопки збереження ─────────────────────────────────────────
  const saveButtonContent = {
    saving:  (
      <span className="flex items-center justify-center gap-2">
        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        Збереження...
      </span>
    ),
    success: <>✅ Збережено!</>,
    error:   <>❌ Помилка — спробуй ще раз</>,
    idle:    <>Зберегти профіль</>,
  }[saveStatus]

  const saveButtonClass = {
    saving:  'bg-gray-300 text-gray-500 cursor-not-allowed',
    success: 'bg-green-500 text-white',
    error:   'bg-red-500 text-white',
    idle:    'bg-brand-primary text-white shadow-lg shadow-brand-primary/30',
  }[saveStatus]

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="min-h-screen bg-tg-bg flex flex-col">

      {/* Тост */}
      {toast && <Toast message={toast.message} type={toast.type} />}

      <main className="flex-1 overflow-y-auto">

        {/* Хедер з аватаром */}
        <div className="bg-tg-secondary px-4 pt-6 pb-5">
          <h1 className="text-tg-text text-xl font-bold mb-4">Мій профіль</h1>
          <div className="flex items-center gap-4">
            {/* Аватар — перша літера імені */}
            <div className="w-16 h-16 rounded-full bg-brand-primary flex items-center justify-center flex-shrink-0 shadow-lg">
              <span className="text-white text-2xl font-bold">{avatarLetter}</span>
            </div>
            <div>
              <p className="text-tg-text font-semibold text-lg leading-tight">
                {displayName}
              </p>
              {tgUser?.first_name && tgUser.username && (
                <p className="text-tg-hint text-sm">{tgUser.first_name}</p>
              )}
              {user && (
                <div className="flex gap-3 mt-1">
                  <span className="text-xs text-tg-hint">⭐️ {user.rating.toFixed(1)}</span>
                  <span className="text-xs text-tg-hint">🪙 {Math.floor(user.karma_balance)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Контент */}
        <div className="px-4 py-5">
          {isLoading ? (
            <ProfileSkeleton />
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <span className="text-4xl">😕</span>
              <p className="text-tg-hint text-sm text-center">{loadError}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 bg-brand-primary text-white rounded-2xl text-sm font-medium"
              >
                Спробувати знову
              </button>
            </div>
          ) : (
            <div className="space-y-6">

              {/* Bio */}
              <section className="space-y-2">
                <label className="text-tg-text font-semibold text-base block">
                  💬 Про себе
                </label>
                <div className="relative">
                  <textarea
                    value={bio}
                    onChange={(e) => {
                      if (e.target.value.length <= BIO_MAX_LENGTH) {
                        setBio(e.target.value)
                      }
                    }}
                    placeholder="Розкажи про себе, свій досвід та чого хочеш навчитися..."
                    rows={4}
                    className={[
                      'w-full bg-tg-secondary text-tg-text placeholder:text-tg-hint',
                      'rounded-2xl px-4 py-3 text-sm leading-relaxed',
                      'border border-transparent focus:border-brand-primary/40',
                      'outline-none resize-none transition-colors',
                    ].join(' ')}
                  />
                  <span
                    className={[
                      'absolute bottom-3 right-3 text-xs pointer-events-none',
                      bio.length > BIO_MAX_LENGTH * 0.9
                        ? 'text-brand-secondary'
                        : 'text-tg-hint',
                    ].join(' ')}
                  >
                    {bio.length}/{BIO_MAX_LENGTH}
                  </span>
                </div>
              </section>

              <div className="h-px bg-gray-100" />

              {/* Offers */}
              <SkillPicker
                label="Можу навчити"
                emoji="✅"
                description="Навички, якими хочеш поділитися"
                allSkills={allSkills}
                selectedIds={offerIds}
                disabledIds={seekIds}
                activeColor="purple"
                onToggle={toggleOffer}
              />

              <div className="h-px bg-gray-100" />

              {/* Seeks */}
              <SkillPicker
                label="Хочу вивчити"
                emoji="🔍"
                description="Навички, які хочеш отримати в обмін"
                allSkills={allSkills}
                selectedIds={seekIds}
                disabledIds={offerIds}
                activeColor="pink"
                onToggle={toggleSeek}
              />

              {/* Кнопка збереження */}
              <div className="pt-2 pb-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveStatus === 'saving'}
                  className={[
                    'w-full py-3.5 rounded-2xl font-semibold text-base',
                    'transition-all duration-200 active:scale-[0.98]',
                    saveButtonClass,
                  ].join(' ')}
                >
                  {saveButtonContent}
                </button>
                <p className="text-center text-tg-hint text-xs mt-2">
                  {offerIds.size} offer · {seekIds.size} seek
                </p>
              </div>

            </div>
          )}
        </div>
      </main>

      <NavBar />
    </div>
  )
}
