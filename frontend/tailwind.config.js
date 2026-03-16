/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cogni: {
          bg: '#0A0F1E',
          card: '#0D1B2A',
          'card-alt': '#111827',
          border: '#1E3A5F',
          accent: '#8B5CF6',
          'accent-light': '#A78BFA',
          teal: '#2DD4BF',
          cyan: '#06B6D4',
          success: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444',
          fading: '#6B7280',
          glow: '#2E86AB',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Syne', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'xp-fill': 'xp-fill 0.8s ease-out',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'xp-fill': {
          from: { width: '0%' },
          to: { width: 'var(--xp-width)' },
        },
      },
    },
  },
  plugins: [],
}
