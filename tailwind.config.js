/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/**/*.html'],
  theme: {
    extend: {
      colors: {
        dither: {
          bg: '#0a0a0a',
          panel: '#1a1a1a',
          border: '#1f1f1f',
          'border-hover': '#2a2a2a',
          'border-active': '#333',
          'border-light': '#444',
          muted: '#666',
          'muted-mid': '#888',
          'muted-light': '#999',
          text: '#e5e5e5',
        },
      },
      animation: {
        'dither-spin': 'dither-spin 0.8s linear infinite',
      },
      keyframes: {
        'dither-spin': {
          to: { transform: 'rotate(360deg)' },
        },
      },
    },
  },
  plugins: [],
};
