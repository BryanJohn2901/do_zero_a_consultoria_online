module.exports = {
  content: ['./index.html'],
  safelist: ['mr-2'],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#131313',
          surface: '#1A1A1A',
          primary: '#D93E28',
          primaryHover: '#B33321',
          primaryLight: '#FF5C45',
          textPrimary: '#FEFEFC',
          textSecondary: '#A3A3A3',
          textMuted: '#666666',
          border: 'rgba(254, 254, 252, 0.08)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        title: ['Oswald', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2.5s infinite linear',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
};
