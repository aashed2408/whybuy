import type { Config } from 'tailwindcss'

export default {
  content: [
    './entrypoints/**/*.{ts,tsx,html}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        mahogany: {
          950: '#120905',
          900: '#1a0e08',
          850: '#22130c',
          800: '#2a160d',
          700: '#3a1f12',
          600: '#4d2818',
          500: '#683620',
        },
        brass: {
          900: '#5a3e0e',
          700: '#8a6517',
          500: '#c9a14a',
          400: '#d6b463',
          300: '#e6c578',
          200: '#f0d99c',
          100: '#f7e8c1',
        },
        parchment: {
          100: '#f7eed7',
          200: '#efe2bf',
          300: '#e0d0a0',
        },
        prosecution: {
          900: '#3a0a13',
          700: '#671224',
          500: '#8a1c2b',
          300: '#b3384a',
        },
        defense: {
          900: '#0b2236',
          700: '#143a5b',
          500: '#1c4f7a',
          300: '#3a78a8',
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        'gavel-strike': {
          '0%': { transform: 'rotate(0deg) translateY(0)' },
          '40%': { transform: 'rotate(-25deg) translateY(-6px)' },
          '60%': { transform: 'rotate(8deg) translateY(2px)' },
          '100%': { transform: 'rotate(0deg) translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'wipe-down': {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '60%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'tilt-left': {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '50%': { transform: 'rotate(-12deg)' },
        },
        'tilt-right': {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '50%': { transform: 'rotate(12deg)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'gavel-strike': 'gavel-strike 450ms ease-in-out',
        'fade-in': 'fade-in 300ms ease-out',
        'fade-up': 'fade-up 320ms ease-out',
        'wipe-down': 'wipe-down 800ms cubic-bezier(0.16, 1, 0.3, 1)',
        'tilt-left': 'tilt-left 600ms ease-in-out',
        'tilt-right': 'tilt-right 600ms ease-in-out',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
