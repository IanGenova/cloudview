import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#111111',
        cream: '#F7F0E6',
        sand: '#D8C4A2',
        gold: '#B88938',
        coal: '#050505'
      },
      boxShadow: {
        soft: '0 18px 60px rgba(0,0,0,0.08)'
      }
    }
  },
  plugins: []
};

export default config;
