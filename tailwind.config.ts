import type { Config } from 'tailwindcss';

/**
 * The design system, defined once.
 *
 * The 2 October audit's first cause was that nothing was: 1,996 `rounded-*`
 * classes in 30 distinct values, 7-10 radii on one screen, 1,481 `font-black`
 * (the heaviest weight available was the product's default, not its emphasis),
 * and a 60px `shadow-soft` glow on every card.
 *
 * Those class names live in 92 files. Rather than edit all of them in one
 * commit and hope, the scale below makes every one of them render square and
 * at most 600-weight the moment it ships; the names are then swept out in the
 * phase after this one, with nothing changing visually when they go. The
 * assertions in `src/lib/design-tokens.test.ts` are what stop the scale
 * drifting back.
 *
 * Colour stays entirely in the `--cv-*` variables of `globals.css`, so all
 * five palettes and `ThemePaletteProvider` keep working untouched.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    /*
     * Replaced, not extended: `extend.borderRadius` would leave Tailwind's own
     * sm/md/lg/xl/2xl/3xl/full in place and 1,996 classes would still round.
     * `rounded-dot` is the single exception the brief allows -- a live status
     * dot and a spinner -- and naming it `dot` rather than `full` is what
     * makes every remaining round thing greppable.
     */
    borderRadius: {
      dot: '9999px',
      none: '0',
      sm: '0',
      DEFAULT: '0',
      md: '0',
      lg: '0',
      xl: '0',
      '2xl': '0',
      '3xl': '0',
      full: '0',
    },

    /* 600 is the ceiling. `black` and `extrabold` keep their names so the
       1,481 call sites compile, and resolve to semibold until swept. */
    fontWeight: {
      light: '300',
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '600',
      extrabold: '600',
      black: '600',
    },

    boxShadow: {
      none: 'none',
      /* Kept as a name so the 17 call sites compile; kept as nothing so they
         stop glowing. */
      soft: 'none',
      /* Elevation only for things that genuinely float: modal, drawer, toast. */
      float: '0 2px 10px rgba(0, 0, 0, 0.28)',
    },

    fontFamily: {
      serif: ['var(--cv-serif)', 'Iowan Old Style', 'Georgia', 'serif'],
      sans: ['var(--cv-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      mono: ['var(--cv-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
    },

    extend: {
      colors: {
        ink: 'var(--cv-ink)',
        cream: 'var(--cv-bg)',
        sand: 'var(--cv-border)',
        gold: 'var(--cv-accent)',
        coal: 'var(--cv-sidebar-bg)',
        /* 1px low-contrast rules do the structural work the radii and the
           shadows were doing. */
        hairline: 'var(--cv-hairline)',
        cv: {
          ink: 'var(--cv-ink)',
          accent: 'var(--cv-accent)',
          accentStrong: 'var(--cv-accent-strong)',
          accentSoft: 'var(--cv-accent-soft)',
          bg: 'var(--cv-bg)',
          card: 'var(--cv-card)',
          border: 'var(--cv-border)',
          hairline: 'var(--cv-hairline)',
          text: 'var(--cv-text)',
          muted: 'var(--cv-muted)',
        },
      },
    },
  },
  plugins: [],
};

export default config;
