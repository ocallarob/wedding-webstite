import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ['var(--font-heading)', 'serif'],
        body: ['var(--font-body)', 'sans-serif'],
      },
      colors: {
        ivory: '#fdfbf7',
        mauve: '#9c7a8c',
        blush: '#dbb8b8',
        sage: '#8fa888',
        gold: '#d4c5a9',
        charcoal: '#3a3530',
        stone: '#e8e2da',
        muted: '#7a756f',
      },
    },
  },
  plugins: [],
};

export default config;
