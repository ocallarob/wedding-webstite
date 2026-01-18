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
        ivory: '#FAF9F6',
        charcoal: '#2A2A2A',
        muted: '#6F6F6F',
        stone: '#E5E2DD',
      },
    },
  },
  plugins: [],
};

export default config;
