'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

type ThemeMode = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'cloudview-theme';

function getSystemTheme() {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyTheme(mode: ThemeMode) {
  if (typeof window === 'undefined') {
    return;
  }

  const resolvedTheme = mode === 'system' ? getSystemTheme() : mode;
  const isDark = resolvedTheme === 'dark';

  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
}

export function ThemeToggle({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [theme, setTheme] = useState<ThemeMode>('system');

  useEffect(() => {
    const savedTheme =
      (window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null) ??
      'system';

    setTheme(savedTheme);
    applyTheme(savedTheme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function handleSystemThemeChange() {
      const currentTheme =
        (window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null) ??
        'system';

      if (currentTheme === 'system') {
        applyTheme('system');
      }
    }

    mediaQuery.addEventListener('change', handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, []);

  function updateTheme(nextTheme: ThemeMode) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }

  const options: {
    value: ThemeMode;
    label: string;
    icon: typeof Sun;
  }[] = [
    {
      value: 'light',
      label: 'Light',
      icon: Sun,
    },
    {
      value: 'dark',
      label: 'Dark',
      icon: Moon,
    },
    {
      value: 'system',
      label: 'System',
      icon: Monitor,
    },
  ];

  if (compact) {
    const activeOption = options.find((option) => option.value === theme);
    const ActiveIcon = activeOption?.icon ?? Monitor;

    return (
      <button
        type="button"
        onClick={() => {
          const currentIndex = options.findIndex(
            (option) => option.value === theme
          );

          const nextOption = options[(currentIndex + 1) % options.length];

          updateTheme(nextOption.value);
        }}
        className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card)] px-3 text-xs font-black text-[var(--cv-text)] transition hover:bg-[var(--cv-card-muted)] dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800"
      >
        <ActiveIcon className="size-4 text-[var(--cv-accent)]" />
        {activeOption?.label ?? 'System'}
      </button>
    );
  }

  return (
    <div className="inline-flex rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card)] p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      {options.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => updateTheme(option.value)}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-black transition',
              active
                ? 'bg-[var(--cv-ink)] text-white dark:bg-[var(--cv-accent)] dark:text-[var(--cv-on-accent)]'
                : 'text-[var(--cv-muted)] hover:bg-[var(--cv-card-muted)] dark:text-neutral-400 dark:hover:bg-neutral-800'
            )}
          >
            <Icon className="size-4" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
