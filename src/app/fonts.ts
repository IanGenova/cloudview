import localFont from 'next/font/local';

/**
 * The product's two faces, self-hosted.
 *
 * Until now CloudView loaded no webfont at all and rendered in whatever
 * `ui-sans-serif` resolved to on the device — which the 2 October audit named
 * as half the reason the interface read as a template rather than as a
 * hotel's own stationery.
 *
 * EB Garamond carries the page titles, the property name, prices and every
 * figure: old-style proportions and the quiet authority of printed
 * collateral. Instrument Sans carries everything a person operates — a
 * neutral grotesque with proper small-caps tracking and no association with
 * any one SaaS product.
 *
 * Both are the variable woff2, stored in `src/app/fonts/` rather than fetched
 * from Google at build time. Two reasons: a build that needs the network to
 * compile is a build that breaks in CI, which this one did; and a guest's
 * phone in a hotel corridor should not be asking Google for anything.
 *
 * They are exposed as CSS variables, so `tailwind.config.ts` names them once
 * and nothing else has to know which family is in use. Changing the pair is
 * two files and one edit here.
 */

export const displaySerif = localFont({
  src: [
    { path: './fonts/EBGaramond-Variable.woff2', weight: '400 600', style: 'normal' },
    { path: './fonts/EBGaramond-Italic-Variable.woff2', weight: '400 600', style: 'italic' },
  ],
  display: 'swap',
  variable: '--cv-serif',
  fallback: ['Iowan Old Style', 'Georgia', 'serif'],
});

export const interfaceSans = localFont({
  src: [{ path: './fonts/InstrumentSans-Variable.woff2', weight: '400 600', style: 'normal' }],
  display: 'swap',
  variable: '--cv-sans',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
});

/** Applied to <html> so both variables are in scope for every surface. */
export const fontVariables = `${displaySerif.variable} ${interfaceSans.variable}`;
