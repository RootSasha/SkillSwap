/** @type {import('tailwindcss').Config} */
export default {
  // Вказуємо де шукати класи Tailwind — критично для tree-shaking
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // Кольори під Telegram-тематику та бренд SkillSwap
      colors: {
        tg: {
          bg:          'var(--tg-theme-bg-color, #ffffff)',
          text:        'var(--tg-theme-text-color, #000000)',
          hint:        'var(--tg-theme-hint-color, #999999)',
          link:        'var(--tg-theme-link-color, #2481cc)',
          button:      'var(--tg-theme-button-color, #2481cc)',
          'button-text': 'var(--tg-theme-button-text-color, #ffffff)',
          secondary:   'var(--tg-theme-secondary-bg-color, #f1f1f1)',
        },
        brand: {
          primary:   '#6C63FF',  // фіолетовий — головний акцент
          secondary: '#FF6584',  // рожевий — для лайків/матчів
          dark:      '#2D2D3A',  // темний текст
        },
      },
      // Шрифтовий стек — системний для швидкого завантаження в TMA
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
      },
      // Анімація для карток свайпу
      keyframes: {
        'slide-up': {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.3s ease-out',
        'fade-in':  'fade-in 0.2s ease-in',
      },
    },
  },
  plugins: [],
}
