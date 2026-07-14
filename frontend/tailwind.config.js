/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Veralogix Group corporate design palette.
        veralogix: {
          lime: '#8DC63F', // Primary — CTAs, focus states, active boundaries, drag handles, priority.
          'lime-hover': '#7AB533', // Darker lime for button hover states.
          charcoal: '#231F20', // Secondary — nav text, headers, sidebars, overlays, body copy.
          grey: '#F1F2F2', // Workspace canvas & list container backgrounds.
          white: '#FFFFFF', // Card / panel / modal surfaces.
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(35, 31, 32, 0.08), 0 1px 3px rgba(35, 31, 32, 0.06)',
        'card-drag': '0 8px 24px rgba(35, 31, 32, 0.18)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(2px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
      },
    },
  },
  plugins: [],
};
