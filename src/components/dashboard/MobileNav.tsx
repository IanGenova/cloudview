'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';

type DashboardNavItem = {
  module: string;
  label: string;
  href: string;
  group?: 'main' | 'settings';
};

const dataBackupNavItem: DashboardNavItem = {
  module: 'DATA_BACKUP',
  label: 'Data Backup & Recovery',
  href: '/dashboard/settings/backups',
  group: 'settings',
};

const mobileLabelMap: Record<string, string> = {
  OVERVIEW: 'Home',
  HOTELS: 'Hotels',
  HOTEL_GUIDE: 'Guide',
  ROOMS_LOCATIONS: 'Rooms',
  NFC_TAGS: 'NFC Tags',
  MENU: 'Menu',
  INVENTORY: 'Inventory',
  GUEST_STAYS: 'Stays',
  ORDERS: 'Orders',
  KITCHEN_DISPLAY: 'Kitchen',
  SERVICES_MODULE: 'Services',
  SERVICE_REQUESTS: 'Requests',
  POS_TERMINAL: 'POS',
  ANALYTICS: 'Analytics',
  REPORTS: 'Reports',
  HOTEL_SETTINGS: 'Hotel Settings',
  USER_ACCOUNT_SETTINGS: 'Users',
  REWARDS: 'Rewards',
  DATA_BACKUP: 'Backup',
};

function getMobileLabel(item: DashboardNavItem) {
  return mobileLabelMap[item.module] ?? item.label;
}

function normalizeRoute(value: string) {
  if (value.length > 1 && value.endsWith('/')) {
    return value.slice(0, -1);
  }

  return value;
}

function routeMatches(pathname: string, href: string) {
  const normalizedPathname = normalizeRoute(pathname);
  const normalizedHref = normalizeRoute(href);

  if (normalizedHref === '/dashboard') {
    return normalizedPathname === '/dashboard';
  }

  return (
    normalizedPathname === normalizedHref ||
    normalizedPathname.startsWith(`${normalizedHref}/`)
  );
}

function getActiveHref(pathname: string, items: DashboardNavItem[]) {
  return (
    items
      .filter((item) => routeMatches(pathname, item.href))
      .sort(
        (first, second) =>
          normalizeRoute(second.href).length -
          normalizeRoute(first.href).length
      )[0]?.href ?? null
  );
}

function insertDataBackupItem(items: DashboardNavItem[]) {
  const hasBackupItem = items.some(
    (item) =>
      item.module === 'DATA_BACKUP' ||
      item.href === dataBackupNavItem.href
  );

  if (hasBackupItem) {
    return items;
  }

  /**
   * navItems is permission-filtered by the dashboard layout.
   * Do not expose the backup route unless HOTEL_SETTINGS is available.
   */
  const canAccessHotelSettings = items.some(
    (item) => item.module === 'HOTEL_SETTINGS'
  );

  if (!canAccessHotelSettings) {
    return items;
  }

  const hotelSettingsIndex = items.findIndex(
    (item) => item.module === 'HOTEL_SETTINGS'
  );

  if (hotelSettingsIndex >= 0) {
    return [
      ...items.slice(0, hotelSettingsIndex + 1),
      dataBackupNavItem,
      ...items.slice(hotelSettingsIndex + 1),
    ];
  }

  return [...items, dataBackupNavItem];
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function MobileNav({
  navItems = [],
}: {
  navItems?: DashboardNavItem[];
}) {
  const pathname = usePathname();

  /**
   * Important:
   * Do not manually expose permission-restricted modules.
   * Backup is inserted only when the already-filtered HOTEL_SETTINGS item exists.
   */
  const mobileNavItems = useMemo(
    () =>
      insertDataBackupItem(
        navItems.filter((item) => item.href && item.label)
      ),
    [navItems]
  );

  const activeHref = useMemo(
    () => getActiveHref(pathname, mobileNavItems),
    [pathname, mobileNavItems]
  );

  if (!mobileNavItems.length) {
    return null;
  }

  return (
    <nav
      aria-label="Mobile dashboard navigation"
      className="sticky top-0 z-40 border-b border-[#2b2416] bg-[#090806]/95 p-3 shadow-[0_14px_35px_rgba(0,0,0,0.35)] backdrop-blur lg:hidden"
    >
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {mobileNavItems.map((item) => {
          const active = item.href === activeHref;

          return (
            <Link
              key={`${item.module}-${item.href}`}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'shrink-0 rounded-full border px-4 py-2 text-sm font-black transition',
                active
                  ? 'border-[#d6a738]/60 bg-gradient-to-r from-[#c99c38] to-[#8f6820] text-[#070604] shadow-[0_10px_24px_rgba(201,156,56,0.22)]'
                  : 'border-[#c99c38]/20 bg-[#151106] text-[#d8d2c3] hover:border-[#c99c38]/50 hover:bg-[#21190c] hover:text-[#f7e7bd]'
              )}
            >
              {getMobileLabel(item)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}