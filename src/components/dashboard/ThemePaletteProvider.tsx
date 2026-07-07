'use client';

import { useEffect, type ReactNode } from 'react';
import {
  applyDashboardThemePalette,
  getSavedDashboardThemePaletteId,
  THEME_PALETTE_EVENT,
} from '@/lib/theme-palettes';

export function ThemePaletteProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    applyDashboardThemePalette(getSavedDashboardThemePaletteId());

    function handlePaletteChange(event: Event) {
      const paletteId = (event as CustomEvent<string>).detail;
      applyDashboardThemePalette(paletteId);
    }

    function handleStorageChange(event: StorageEvent) {
      if (event.key === 'cloudview-theme-palette') {
        applyDashboardThemePalette(event.newValue);
      }
    }

    window.addEventListener(THEME_PALETTE_EVENT, handlePaletteChange);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener(THEME_PALETTE_EVENT, handlePaletteChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return <>{children}</>;
}
