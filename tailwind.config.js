/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F7F3EA',
        bgHero: '#EFE7D3',
        surface: '#FFFFFF',
        surface2: '#F1ECDF',
        border: '#E4DCC8',
        borderStrong: '#CFC4A8',
        primary: '#2E6B4F',
        primaryHover: '#245A41',
        accent: '#2F7A57',
        accentLight: '#6FA88A',
        gold: '#D9A441',
        goldSoft: '#F6E7C1',
        info: '#3A6EA5',
        warning: '#B9801A',
        danger: '#C2493D',
        text: '#1B2E24',
        textSecondary: '#4A5B50',
        muted: '#7A867D',
        sidebarBg: '#1E3A2C',
        sidebarHover: '#2A4A38',
        sidebarActive: '#2E6B4F',
        sidebarText: '#C9DCCF',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Source Serif 4"', 'Georgia', 'serif'],
      },
      spacing: { '18': '4.5rem' },
      maxWidth: { content: '1200px' },
      boxShadow: {
        card: '0 1px 2px rgba(30,58,44,0.05), 0 4px 14px rgba(30,58,44,0.05)',
        lift: '0 2px 4px rgba(30,58,44,0.06), 0 10px 28px rgba(30,58,44,0.10)',
      },
    },
  },
  plugins: [],
}
