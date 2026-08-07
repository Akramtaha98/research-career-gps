/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Inter is loaded in index.html with a full system-font fallback
        // stack, so text still renders in a good native UI font (and at the
        // right metrics) if the webfont is slow or blocked — no invisible
        // text, no layout shift into a serif default.
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        // Filled out from the original 6 shades to a complete ramp: the app
        // now needs subtle borders (200/300) and deep text-on-light accents
        // (800/900) that previously had to be faked with opacity modifiers.
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #6d28d9 0%, #4f46e5 50%, #0ea5e9 100%)',
      },
      boxShadow: {
        // Layered, low-opacity shadows instead of one hard drop shadow —
        // the close-range ambient layer keeps edges crisp while the wider,
        // softer layer gives depth, which is what makes a card read as
        // "modern" rather than "2015 material design".
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 16px rgba(15, 23, 42, 0.04)',
        'card-hover': '0 2px 4px rgba(15, 23, 42, 0.05), 0 12px 32px rgba(15, 23, 42, 0.08)',
        btn: '0 1px 2px rgba(15, 23, 42, 0.05)',
      },
    },
  },
  plugins: [],
};
