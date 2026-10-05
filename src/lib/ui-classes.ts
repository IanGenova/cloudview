/**
 * Every class the six `ui/` primitives wear, built in one place.
 *
 * The 2 October audit (`.flow/UIUX-2026-10-02.md`) found the product had no
 * design system, only utility classes: 1,996 `rounded-*` in 30 distinct
 * values, 7-10 radii on a single screen, 1,481 `font-black` -- more elements
 * at weight 900 than at weight 400 on the orders board -- and `outline-none`
 * on 149 controls, 37 of them with no replacement focus style at all,
 * including both gates into the product and ten inputs in the POS till.
 *
 * The rules live here as code and in `ui-classes.test.ts` as assertions, so a
 * later component cannot quietly reintroduce them:
 *
 *   - nothing has a corner radius except a live status dot and a spinner;
 *   - no weight above 600;
 *   - hairlines separate surfaces, shadows do not;
 *   - the accent is a line, a rule and one word -- never a filled surface;
 *   - every interactive box is at least 44px;
 *   - focus is a real 2px outline at 2px offset, taking its colour from the
 *     text so it works on paper and on ink, and it is never removed.
 *
 * Colour comes from the `--cv-*` tokens in `globals.css`, so all five palettes
 * and both themes keep working without a single literal here.
 */

/** The only two things in the product allowed to be round. */
export const ROUND_EXEMPT = ['status dot', 'spinner'] as const;

/**
 * A focus indicator needs 3:1. The audit measured the old tinted rings at
 * 1.13-1.90:1, so this is an outline in the element's own text colour, which
 * is by definition already legible against the surface behind it.
 */
export const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current';

/** 44px, the one-handed-outdoors minimum. Tailwind's 11 is 2.75rem. */
const TAP = 'min-h-11';

const TRANSITION = 'transition-[background-color,border-color,color] duration-150 ease-out';

function join(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/* ── Button ──────────────────────────────────────────────────────────────── */

export type ButtonVariant = 'default' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

/*
 * One filled variant, and it is ink rather than gold: the audit found Reject
 * and Mark Paid were the two highest-chroma controls on every order card while
 * the routine action was the quiet one. Destructive is a word in the danger
 * colour with a hairline on hover, not a red slab.
 */
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  default: 'bg-[var(--cv-ink)] text-white hover:bg-[var(--cv-ink-soft)]',
  outline:
    'border border-[var(--cv-border)] text-[var(--cv-text)] hover:border-[var(--cv-text)]',
  ghost: 'text-[var(--cv-muted)] hover:text-[var(--cv-text)]',
  danger:
    'border border-transparent text-[var(--cv-status-danger)] hover:border-[var(--cv-status-danger)]',
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 text-[13px]',
  md: 'px-5 text-sm',
  lg: 'px-6 text-base',
  icon: 'min-w-11 px-0',
};

export function buttonClasses(
  opts: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}
) {
  const { variant = 'default', size = 'md', className } = opts;

  return join(
    'inline-flex items-center justify-center gap-2 font-medium tracking-[0.01em]',
    TAP,
    TRANSITION,
    FOCUS_RING,
    'disabled:cursor-not-allowed disabled:opacity-50',
    BUTTON_VARIANT[variant],
    BUTTON_SIZE[size],
    className
  );
}

/* ── Field ───────────────────────────────────────────────────────────────── */

/*
 * Label above, hairline border, and the error at the field. The audit found
 * every checkout error written into one banner 725px below the input it was
 * about, so `invalid` has to be visible on the control itself.
 */
export function fieldClasses(opts: { invalid?: boolean; className?: string } = {}) {
  const { invalid, className } = opts;

  return join(
    'w-full bg-[var(--cv-card)] px-3 py-2.5 text-[15px] text-[var(--cv-text)]',
    'placeholder:text-[var(--cv-muted)]',
    TAP,
    TRANSITION,
    FOCUS_RING,
    'disabled:cursor-not-allowed disabled:opacity-60',
    invalid
      ? 'border border-[var(--cv-status-danger)]'
      : 'border border-[var(--cv-border)] hover:border-[var(--cv-text)]',
    className
  );
}

/* ── Card and surface ────────────────────────────────────────────────────── */

export function cardClasses(opts: { className?: string } = {}) {
  return join(
    'border border-[var(--cv-border)] bg-[var(--cv-card)]',
    opts.className
  );
}

/** The page ground: paper or ink, and figures that line up in a column. */
export function surfaceClasses(opts: { className?: string } = {}) {
  return join(
    'bg-[var(--cv-bg)] text-[var(--cv-text)] tabular-nums',
    opts.className
  );
}

/* ── Badge ───────────────────────────────────────────────────────────────── */

export type BadgeTone = 'neutral' | 'gold' | 'green' | 'red' | 'blue';

/*
 * A hairline and a word. The filled pills were how red and green came to mean
 * two unrelated things on one screen -- three green READY badges above an
 * order badged UNPAID in red.
 */
const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'border-[var(--cv-border)] text-[var(--cv-muted)]',
  gold: 'border-[var(--cv-accent)] text-[var(--cv-accent-strong)]',
  green: 'border-[var(--cv-status-active)] text-[var(--cv-status-active)]',
  red: 'border-[var(--cv-status-danger)] text-[var(--cv-status-danger)]',
  blue: 'border-[var(--cv-status-preparing)] text-[var(--cv-status-preparing)]',
};

export function badgeClasses(tone: BadgeTone = 'neutral', className?: string) {
  return join(
    'inline-flex items-center gap-1.5 border px-2 py-0.5',
    'text-[11px] font-semibold uppercase tracking-[0.14em]',
    BADGE_TONE[tone] ?? BADGE_TONE.neutral,
    className
  );
}

/* ── Status ──────────────────────────────────────────────────────────────── */

export type StatusTone = 'live' | 'wait' | 'stop' | 'done';

/*
 * Written out in full rather than composed. Tailwind's content scanner is
 * textual, so a class name assembled from a template interpolation is never
 * emitted — and worse, the scanner matches the half-written name in the
 * source and emits the interpolation itself into the stylesheet, where it
 * fails to parse. The build caught exactly that, twice: once from the code,
 * and once from the comment that explained it. Four literals is the price of
 * the scanner seeing them.
 */
const STATUS_DOT: Record<StatusTone, string> = {
  live: 'bg-[var(--cv-status-active)]',
  wait: 'bg-[var(--cv-status-pending)]',
  stop: 'bg-[var(--cv-status-danger)]',
  done: 'bg-[var(--cv-status-done)]',
};

/*
 * A dot and a word, and the word is always the caller's. On the kitchen
 * display -- the one screen read at two metres -- whether a line was cancelled
 * was a 6px dot at 2.46:1 and nothing else; a cook reading the ticket cooked
 * the cancelled dish. The dot may be round -- `rounded-dot` is the only
 * radius utility the scale still resolves to anything, which is what makes the
 * exception greppable.
 */
export function statusDotClasses(tone: StatusTone) {
  return join('size-[7px] shrink-0 rounded-dot', STATUS_DOT[tone] ?? STATUS_DOT.done);
}

export function statusClasses(tone: StatusTone) {
  return {
    wrap: 'inline-flex items-center gap-2 text-[var(--cv-text)]',
    dot: statusDotClasses(tone),
  };
}
