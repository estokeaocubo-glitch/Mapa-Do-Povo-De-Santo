/** @type {import('tailwindcss').Config} */
export default {
  content: ['./public/*.html', './public/js/**/*.js', './public/app.js'],
  theme: {
    extend: {
      colors: {
        breu: '#12100E',
        carvao: '#1C1917',
        terracota: { DEFAULT: '#C85A32', 400: '#D97850', 600: '#A8461F' },
        ouro: { DEFAULT: '#D4AF37', 300: '#E6CB6E' },
        algodao: '#F5F5F0',
        // Cores dos pinos por segmento (validadas para daltonismo sobre fundo escuro)
        umbanda: '#5B8DEF',
        candomble: '#C49A22',
        mata: '#3A9460',
        axe: '#9468E6',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['Cinzel', '"Playfair Display"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
