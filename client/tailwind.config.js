/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // CodeSync brand palette (used via e.g. bg-brand-600).
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#bcd3ff',
          300: '#8eb6ff',
          400: '#598eff',
          500: '#3366ff',
          600: '#1f45f5',
          700: '#1832e1',
          800: '#1a2bb6',
          900: '#1c2c8f',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Consolas', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
