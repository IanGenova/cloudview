'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Palette, Search } from 'lucide-react';
import {
  applyDashboardThemePalette,
  DASHBOARD_THEME_PALETTES,
  DASHBOARD_THEME_PALETTE_CATEGORIES,
  getDashboardThemePalette,
  getSavedDashboardThemePaletteId,
  THEME_PALETTE_EVENT,
  type DashboardThemePalette,
  type DashboardThemePaletteCategory,
  type DashboardThemePaletteId,
} from '@/lib/theme-palettes';

type ThemePaletteSelectorProps = {
  compact?: boolean;
  className?: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function PaletteSwatches({ swatches }: { swatches: string[] }) {
  return (
    <span className="flex shrink-0 overflow-hidden rounded-full border border-white/60 shadow-sm">
      {swatches.map((color, index) => (
        <span
          key={`${color}-${index}`}
          className="size-4"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  );
}

function groupPalettes(palettes: DashboardThemePalette[]) {
  return DASHBOARD_THEME_PALETTE_CATEGORIES.map((category) => ({
    category,
    palettes: palettes.filter((palette) => palette.category === category),
  })).filter((group) => group.palettes.length > 0);
}

function filterPalettes({
  search,
  category,
}: {
  search: string;
  category: DashboardThemePaletteCategory | 'ALL';
}) {
  const normalizedSearch = search.trim().toLowerCase();

  return DASHBOARD_THEME_PALETTES.filter((palette) => {
    if (category !== 'ALL' && palette.category !== category) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return [
      palette.name,
      palette.shortName,
      palette.category,
      palette.description,
      palette.id,
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch);
  });
}

function PaletteOption({
  palette,
  active,
  onClick,
  compact = false,
}: {
  palette: DashboardThemePalette;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-3 rounded-2xl border text-left transition',
        compact ? 'p-2.5' : 'p-3',
        active
          ? 'border-[var(--cv-accent)] bg-[var(--cv-accent-soft)]'
          : 'border-transparent hover:border-[var(--cv-border)] hover:bg-[var(--cv-card-muted)]'
      )}
    >
      <PaletteSwatches swatches={palette.swatches} />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black">
          {palette.name}
        </span>
        <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--cv-muted)]">
          {palette.description}
        </span>
      </span>

      {active ? (
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--cv-accent)] text-[var(--cv-on-accent)]">
          <Check className="size-4" />
        </span>
      ) : null}
    </button>
  );
}

export function ThemePaletteSelector({
  compact = false,
  className,
}: ThemePaletteSelectorProps) {
  const [paletteId, setPaletteId] = useState<DashboardThemePaletteId>(
    'luxe-gold'
  );
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<DashboardThemePaletteCategory | 'ALL'>(
    'ALL'
  );
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const activePalette = useMemo(
    () => getDashboardThemePalette(paletteId),
    [paletteId]
  );

  const filteredPalettes = useMemo(
    () =>
      filterPalettes({
        search,
        category,
      }),
    [category, search]
  );

  const groupedPalettes = useMemo(
    () => groupPalettes(filteredPalettes),
    [filteredPalettes]
  );

  useEffect(() => {
    const saved = getSavedDashboardThemePaletteId();
    setPaletteId(saved);
    applyDashboardThemePalette(saved);
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);

    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  function updatePalette(nextPaletteId: DashboardThemePaletteId) {
    setPaletteId(nextPaletteId);
    applyDashboardThemePalette(nextPaletteId);
    window.dispatchEvent(
      new CustomEvent(THEME_PALETTE_EVENT, {
        detail: nextPaletteId,
      })
    );
    setOpen(false);
  }

  if (compact) {
    return (
      <div ref={wrapperRef} className={cx('relative', className)}>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card)] px-3 text-xs font-black text-[var(--cv-text)] shadow-sm transition hover:bg-[var(--cv-card-muted)]"
        >
          <Palette className="size-4 text-[var(--cv-accent)]" />
          <span className="hidden sm:inline">{activePalette.shortName}</span>
          <PaletteSwatches swatches={activePalette.swatches.slice(0, 3)} />
        </button>

        {open ? (
          <div className="absolute right-0 top-full z-[130] mt-3 w-[min(28rem,calc(100vw-2rem))] rounded-[1.5rem] border border-[var(--cv-border)] bg-[var(--cv-card)] p-3 text-[var(--cv-text)] shadow-2xl">
            <div className="px-2 pb-2">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--cv-accent-strong)]">
                Admin Palette
              </p>
              <p className="mt-1 text-xs font-semibold text-[var(--cv-muted)]">
                Includes CloudView palettes plus Figma Resource Library-inspired website color schemes.
              </p>
            </div>

            <div className="mb-3 grid gap-2">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--cv-muted)]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search palette..."
                  className="h-10 w-full rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-muted)] pl-9 pr-3 text-xs font-bold outline-none focus:border-[var(--cv-accent)]"
                />
              </label>

              <select
                value={category}
                onChange={(event) =>
                  setCategory(
                    event.target.value as DashboardThemePaletteCategory | 'ALL'
                  )
                }
                className="h-10 rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-muted)] px-3 text-xs font-black text-[var(--cv-text)] outline-none focus:border-[var(--cv-accent)]"
              >
                <option value="ALL">All palettes</option>
                {DASHBOARD_THEME_PALETTE_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="max-h-[65vh] overflow-y-auto pr-1 [scrollbar-width:thin]">
              {groupedPalettes.length ? (
                groupedPalettes.map((group) => (
                  <div key={group.category} className="mb-3 last:mb-0">
                    <p className="mb-1 px-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--cv-accent-strong)]">
                      {group.category}
                    </p>
                    <div className="grid gap-1.5">
                      {group.palettes.map((palette) => (
                        <PaletteOption
                          key={palette.id}
                          palette={palette}
                          active={palette.id === paletteId}
                          compact
                          onClick={() => updatePalette(palette.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-[var(--cv-border)] p-4 text-center text-xs font-bold text-[var(--cv-muted)]">
                  No palette found.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section className={cx('grid gap-4', className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--cv-accent-strong)]">
            Admin Portal Palette
          </p>
          <h3 className="mt-1 text-lg font-black text-[var(--cv-text)]">
            Theme color setting
          </h3>
          <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-[var(--cv-muted)]">
            This controls the dashboard sidebar, header accents, buttons, and admin interface colors.
            It is saved in this browser and does not change guest portal branding.
          </p>
        </div>

        <span className="w-fit rounded-full bg-[var(--cv-accent-soft)] px-3 py-1 text-xs font-black text-[var(--cv-accent-strong)]">
          {activePalette.shortName} · {DASHBOARD_THEME_PALETTES.length} palettes
        </span>
      </div>

      <div className="grid gap-3 rounded-[1.5rem] border border-[var(--cv-border)] bg-[var(--cv-card)] p-3 md:grid-cols-[minmax(0,1fr)_240px]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--cv-muted)]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Figma scheme, CloudView palette, category, or mood..."
            className="h-12 w-full rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-muted)] pl-11 pr-4 text-sm font-bold text-[var(--cv-text)] outline-none focus:border-[var(--cv-accent)]"
          />
        </label>

        <select
          value={category}
          onChange={(event) =>
            setCategory(event.target.value as DashboardThemePaletteCategory | 'ALL')
          }
          className="h-12 rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-muted)] px-4 text-sm font-black text-[var(--cv-text)] outline-none focus:border-[var(--cv-accent)]"
        >
          <option value="ALL">All categories</option>
          {DASHBOARD_THEME_PALETTE_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-5">
        {groupedPalettes.length ? (
          groupedPalettes.map((group) => (
            <div key={group.category}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--cv-accent-strong)]">
                  {group.category}
                </p>
                <span className="rounded-full bg-[var(--cv-card-muted)] px-3 py-1 text-[11px] font-black text-[var(--cv-muted)]">
                  {group.palettes.length} option{group.palettes.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                {group.palettes.map((palette) => {
                  const active = palette.id === paletteId;

                  return (
                    <button
                      key={palette.id}
                      type="button"
                      onClick={() => updatePalette(palette.id)}
                      className={cx(
                        'rounded-[1.25rem] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg',
                        active
                          ? 'border-[var(--cv-accent)] bg-[var(--cv-accent-soft)] shadow-sm'
                          : 'border-[var(--cv-border)] bg-[var(--cv-card)] hover:border-[var(--cv-accent)]'
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <PaletteSwatches swatches={palette.swatches} />
                        {active ? (
                          <span className="grid size-7 place-items-center rounded-full bg-[var(--cv-accent)] text-[var(--cv-on-accent)]">
                            <Check className="size-4" />
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-4 text-sm font-black text-[var(--cv-text)]">
                        {palette.name}
                      </p>
                      <p className="mt-1 text-xs font-semibold leading-5 text-[var(--cv-muted)]">
                        {palette.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-[1.5rem] border border-dashed border-[var(--cv-border)] bg-[var(--cv-card)] p-8 text-center text-sm font-bold text-[var(--cv-muted)]">
            No palette found. Try another search term.
          </p>
        )}
      </div>
    </section>
  );
}
