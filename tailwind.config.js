/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          50: '#F0F5F2',
          100: '#D9E8E0',
          200: '#B3D1C1',
          300: '#8DBAA2',
          400: '#67A383',
          500: '#418C64',
          600: '#357050',
          700: '#2A5740',
          800: '#1B3B2B',
          900: '#132E20',
          950: '#0A1A12',
        },
        gold: {
          50: '#FBF7E8',
          100: '#F5EAC8',
          200: '#EBD491',
          300: '#E0BE5A',
          400: '#D4AF37',
          500: '#C59B27',
          600: '#A07D1F',
          700: '#755E17',
          800: '#4A3B0F',
          900: '#2E240A',
        },
        cream: {
          50: '#FDFBF7',
          100: '#F5F0EB',
          200: '#EDE5DC',
          300: '#E0D5C8',
          400: '#C9BAA8',
        },
        charcoal: {
          50: '#F5F5F5',
          100: '#E0E0E0',
          200: '#BDBDBD',
          300: '#9E9E9E',
          400: '#757575',
          500: '#616161',
          600: '#424242',
          700: '#2E2E2E',
          800: '#1A1A1A',
          900: '#0D0D0D',
        },
      },
      fontFamily: {
        sans: ['Tajawal', 'Cairo', 'sans-serif'],
        display: ['Cairo', 'Tajawal', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 2px 12px rgba(27, 59, 43, 0.06)',
        'card': '0 4px 24px rgba(27, 59, 43, 0.08)',
        'gold': '0 4px 16px rgba(212, 175, 55, 0.25)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-gold': 'pulseGold 2s ease-in-out infinite',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'overlay-in': 'overlayIn 0.4s ease-out',
        'check-pop': 'checkPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(212, 175, 55, 0.4)' },
          '50%': { boxShadow: '0 0 0 12px rgba(212, 175, 55, 0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.8)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        overlayIn: {
          '0%': { opacity: '0', backdropFilter: 'blur(0px)' },
          '100%': { opacity: '1', backdropFilter: 'blur(4px)' },
        },
        checkPop: {
          '0%': { opacity: '0', transform: 'scale(0)' },
          '60%': { opacity: '1', transform: 'scale(1.15)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
