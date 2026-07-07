'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Palette, Search, X } from 'lucide-react';
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

function PaletteFilters({
  search,
  category,
  onSearchChange,
  onCategoryChange,
  compact = false,
}: {
  search: string;
  category: DashboardThemePaletteCategory | 'ALL';
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: DashboardThemePaletteCategory | 'ALL') => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'grid gap-2' : 'grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]'}>
      <label className="relative block">
        <Search
          className={cx(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--cv-muted)]',
            compact ? 'left-3 size-4' : 'left-4 size-4'
          )}
        />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={
            compact
              ? 'Search palette...'
              : 'Search palette, category, mood, or scheme...'
          }
          className={cx(
            'w-full rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-muted)] font-bold text-[var(--cv-text)] outline-none focus:border-[var(--cv-accent)]',
            compact
              ? 'h-10 pl-9 pr-3 text-xs'
              : 'h-11 pl-11 pr-4 text-sm'
          )}
        />
      </label>

      <select
        value={category}
        onChange={(event) =>
          onCategoryChange(
            event.target.value as DashboardThemePaletteCategory | 'ALL'
          )
        }
        className={cx(
          'rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-muted)] font-black text-[var(--cv-text)] outline-none focus:border-[var(--cv-accent)]',
          compact ? 'h-10 px-3 text-xs' : 'h-11 px-4 text-sm'
        )}
      >
        <option value="ALL">All palettes</option>
        {DASHBOARD_THEME_PALETTE_CATEGORIES.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </div>
  );
}

function PaletteGroupList({
  groupedPalettes,
  paletteId,
  onSelect,
  twoColumns = false,
}: {
  groupedPalettes: ReturnType<typeof groupPalettes>;
  paletteId: DashboardThemePaletteId;
  onSelect: (paletteId: DashboardThemePaletteId) => void;
  twoColumns?: boolean;
}) {
  if (!groupedPalettes.length) {
    return (
      <p className="rounded-2xl border border-dashed border-[var(--cv-border)] p-4 text-center text-xs font-bold text-[var(--cv-muted)]">
        No palette found.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {groupedPalettes.map((group) => (
        <div key={group.category}>
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--cv-accent-strong)]">
              {group.category}
            </p>
            <span className="rounded-full bg-[var(--cv-card-muted)] px-2.5 py-1 text-[10px] font-black text-[var(--cv-muted)]">
              {group.palettes.length}
            </span>
          </div>

          <div className={cx('grid gap-2', twoColumns && 'md:grid-cols-2')}>
            {group.palettes.map((palette) => (
              <PaletteOption
                key={palette.id}
                palette={palette}
                active={palette.id === paletteId}
                compact
                onClick={() => onSelect(palette.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
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
  const dialogRef = useRef<HTMLDialogElement | null>(null);

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
    if (!compact) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);

    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [compact]);

  useEffect(() => {
    if (compact) {
      return;
    }

    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    }

    if (!open && dialog.open) {
      dialog.close();
    }
  }, [compact, open]);

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
                Compact palette switcher for the admin dashboard.
              </p>
            </div>

            <div className="mb-3">
              <PaletteFilters
                search={search}
                category={category}
                onSearchChange={setSearch}
                onCategoryChange={setCategory}
                compact
              />
            </div>

            <div className="max-h-[65vh] overflow-y-auto pr-1 [scrollbar-width:thin]">
              <PaletteGroupList
                groupedPalettes={groupedPalettes}
                paletteId={paletteId}
                onSelect={updatePalette}
              />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section className={cx('grid gap-3', className)}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--cv-accent-strong)]">
            Admin Portal Palette
          </p>
          <h3 className="mt-1 text-lg font-black text-[var(--cv-text)]">
            Theme color setting
          </h3>
          <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-[var(--cv-muted)]">
            This controls dashboard colors only. It is saved in this browser and does not change guest portal branding.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-[1.5rem] border border-[var(--cv-border)] bg-[var(--cv-card)] p-3 sm:flex-row sm:items-center sm:justify-between xl:min-w-[26rem]">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--cv-accent-soft)] text-[var(--cv-accent-strong)]">
              <Palette className="size-5" />
            </span>

            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-black text-[var(--cv-text)]">
                  {activePalette.name}
                </p>
                <PaletteSwatches swatches={activePalette.swatches.slice(0, 4)} />
              </div>
              <p className="mt-1 truncate text-xs font-semibold text-[var(--cv-muted)]">
                {activePalette.description}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--cv-accent)] px-4 text-xs font-black text-[var(--cv-on-accent)] shadow-sm transition hover:opacity-90"
          >
            <Palette className="size-4" />
            Change Palette
          </button>
        </div>
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setOpen(false);
          }
        }}
        className="w-[calc(100%-1rem)] max-w-4xl rounded-[2rem] border border-[var(--cv-border)] bg-[var(--cv-card)] p-0 text-[var(--cv-text)] shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <div className="overflow-hidden rounded-[2rem] bg-[var(--cv-card)]">
          <div className="sticky top-0 z-10 border-b border-[var(--cv-border)] bg-[var(--cv-card)] p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--cv-accent-strong)]">
                  Admin Palette
                </p>
                <h2 className="mt-1 text-2xl font-black text-[var(--cv-text)]">
                  Choose dashboard theme
                </h2>
                <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-[var(--cv-muted)]">
                  Pick a color palette without expanding the Hotel Settings page. The selected theme applies instantly.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--cv-card-muted)] text-[var(--cv-text)] transition hover:bg-[var(--cv-accent-soft)]"
                aria-label="Close palette selector"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-4">
              <PaletteFilters
                search={search}
                category={category}
                onSearchChange={setSearch}
                onCategoryChange={setCategory}
              />
            </div>
          </div>

          <div className="max-h-[min(62vh,42rem)] overflow-y-auto p-4 [scrollbar-width:thin]">
            <div className="mb-4 rounded-[1.25rem] border border-[var(--cv-border)] bg-[var(--cv-card-muted)] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--cv-accent-strong)]">
                    Current palette
                  </p>
                  <p className="mt-1 truncate text-sm font-black text-[var(--cv-text)]">
                    {activePalette.name}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[var(--cv-muted)]">
                    {activePalette.shortName} · {DASHBOARD_THEME_PALETTES.length} total palettes
                  </p>
                </div>

                <PaletteSwatches swatches={activePalette.swatches} />
              </div>
            </div>

            <PaletteGroupList
              groupedPalettes={groupedPalettes}
              paletteId={paletteId}
              onSelect={updatePalette}
              twoColumns
            />
          </div>
        </div>
      </dialog>
    </section>
  );
}
