/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0066FF',
          hover: '#0052CC',
          light: '#EBF2FF',
          dark: '#0047B3'
        },
        surface: {
          DEFAULT: '#FFFFFF',
          ground: '#F8FAFC',
          card: '#FFFFFF'
        },
        paper: '#F8FAFC',
        rule: '#E2E8F0',
        ink: '#0F172A',
        inkSoft: '#64748B',
        amber: '#D97706',
        due: '#DC2626'
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        headline: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        label: ['"Public Sans"', 'Inter', 'sans-serif']
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem'
      },
      boxShadow: {
        '2xs': '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'xs': '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
      }
    }
  },
  plugins: []
}
