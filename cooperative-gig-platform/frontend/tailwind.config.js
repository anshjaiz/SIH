/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#edf6ef',
          100: '#d8ebdc',
          200: '#b8d8c0',
          300: '#8dbca0',
          400: '#5d9a7b',
          500: '#34775e',
          600: '#28634e',
          700: '#20503f',
          800: '#183d31',
          900: '#102a22',
        },
        accent: {
          50:  '#fffaf0',
          100: '#f8edcf',
          200: '#f1d99c',
          300: '#e9c66b',
          400: '#dfb34d',
          500: '#c9942d',
          600: '#ae7920',
          700: '#8c5e18',
        },
        success: { 500: '#10b981', 600: '#059669' },
        danger:  { 500: '#ef4444', 600: '#dc2626' },
        warning: { 500: '#f59e0b', 600: '#d97706' },
      },
      fontFamily: {
        sans: ['Manrope', 'DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
