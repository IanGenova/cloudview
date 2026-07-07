import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--cv-ink)',
        cream: 'var(--cv-bg)',
        sand: 'var(--cv-border)',
        gold: 'var(--cv-accent)',
        coal: 'var(--cv-sidebar-bg)',
        cv: {
          ink: 'var(--cv-ink)',
          accent: 'var(--cv-accent)',
          accentStrong: 'var(--cv-accent-strong)',
          accentSoft: 'var(--cv-accent-soft)',
          bg: 'var(--cv-bg)',
          card: 'var(--cv-card)',
          border: 'var(--cv-border)',
          text: 'var(--cv-text)',
          muted: 'var(--cv-muted)',
        },
      },
      boxShadow: {
        soft: '0 18px 60px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
