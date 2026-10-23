'use client';

import Link from 'next/link';
import { ChevronDown, Menu } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
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
  HOTELS: 'Properties',
  HOTEL_GUIDE: 'Guide',
  ROOMS_LOCATIONS: 'Rooms',
  NFC_TAGS: 'NFC Tags',
  MENU: 'Menu',
  INVENTORY: 'Inventory',
  GUEST_STAYS: 'Stays',
  ORDERS: 'Orders',
  KITCHEN_DISPLAY: 'Kitchen',
  SERVICES_MODULE: 'Catalog',
  SERVICE_REQUESTS: 'Requests',
  POS_TERMINAL: 'POS',
  ANALYTICS: 'Analytics',
  REPORTS: 'Reports',
  HOTEL_SETTINGS: 'Hotel Settings',
  USER_ACCOUNT_SETTINGS: 'Users & Access',
  REWARDS: 'Rewards',
  DATA_BACKUP: 'Backup',
};

const mobileGroups = [
  {
    label: 'Daily operations',
    modules: ['OVERVIEW', 'ORDERS', 'KITCHEN_DISPLAY', 'SERVICE_REQUESTS', 'POS_TERMINAL'],
  },
  {
    label: 'Property & guests',
    modules: ['HOTELS', 'GUEST_STAYS', 'ROOMS_LOCATIONS', 'NFC_TAGS', 'HOTEL_GUIDE', 'REWARDS'],
  },
  {
    label: 'Catalog & stock',
    modules: ['MENU', 'SERVICES_MODULE', 'INVENTORY'],
  },
  {
    label: 'Insights',
    modules: ['ANALYTICS', 'REPORTS'],
  },
  {
    label: 'Settings',
    modules: ['HOTEL_SETTINGS', 'DATA_BACKUP', 'USER_ACCOUNT_SETTINGS'],
  },
];

function getMobileLabel(item: DashboardNavItem) {
  return mobileLabelMap[item.module] ?? item.label;
}

function normalizeRoute(value: string) {
  return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;
}

function routeMatches(pathname: string, href: string) {
  const normalizedPathname = normalizeRoute(pathname);
  const normalizedHref = normalizeRoute(href);

  return normalizedHref === '/dashboard'
    ? normalizedPathname === '/dashboard'
    : normalizedPathname === normalizedHref || normalizedPathname.startsWith(`${normalizedHref}/`);
}

function insertDataBackupItem(items: DashboardNavItem[]) {
  if (items.some((item) => item.module === 'DATA_BACKUP' || item.href === dataBackupNavItem.href)) {
    return items;
  }

  // navItems is already permission-filtered by the dashboard layout.
  const hotelSettingsIndex = items.findIndex((item) => item.module === 'HOTEL_SETTINGS');
  if (hotelSettingsIndex < 0) {
    return items;
  }

  return [
    ...items.slice(0, hotelSettingsIndex + 1),
    dataBackupNavItem,
    ...items.slice(hotelSettingsIndex + 1),
  ];
}

export function MobileNav({ navItems = [] }: { navItems?: DashboardNavItem[] }) {
  const pathname = usePathname();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const items = useMemo(
    () => insertDataBackupItem(navItems.filter((item) => item.href && item.label)),
    [navItems]
  );
  const activeItem = useMemo(
    () =>
      items
        .filter((item) => routeMatches(pathname, item.href))
        .sort((first, second) => normalizeRoute(second.href).length - normalizeRoute(first.href).length)[0],
    [pathname, items]
  );
  const groupedItems = useMemo(() => {
    const knownModules = new Set(mobileGroups.flatMap((group) => group.modules));
    const groups = mobileGroups.map((group) => ({
      label: group.label,
      items: group.modules.flatMap((module) => items.filter((item) => item.module === module)),
    })).filter((group) => group.items.length > 0);
    const otherItems = items.filter((item) => !knownModules.has(item.module));
    return otherItems.length > 0 ? [...groups, { label: 'Other', items: otherItems }] : groups;
  }, [items]);

  useEffect(() => {
    menuRef.current?.removeAttribute('open');
  }, [pathname]);

  if (!items.length) {
    return null;
  }

  return (
    <nav aria-label="Mobile dashboard navigation" className="sticky top-0 z-50 border-b border-[#2b2416] bg-[#090806] text-white lg:hidden">
      <div className="flex h-16 items-center justify-between gap-3 px-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#d6a738]">CloudView</p>
          <p className="truncate text-sm font-semibold">{activeItem ? getMobileLabel(activeItem) : 'Dashboard'}</p>
        </div>

        <details
          ref={menuRef}
          className="group shrink-0"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              menuRef.current?.removeAttribute('open');
              menuRef.current?.querySelector('summary')?.focus();
            }
          }}
        >
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 border border-[#c99c38]/50 px-3 text-sm font-semibold text-[#f7e7bd] marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d6a738]">
            <Menu className="size-4" /> All pages <ChevronDown className="size-4 transition group-open:rotate-180" />
          </summary>
          <div className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-[#c99c38]/30 bg-[#100d08] p-4 shadow-[0_22px_35px_rgba(0,0,0,0.45)]">
            <div className="mx-auto grid max-w-2xl gap-5 sm:grid-cols-2">
              {groupedItems.map((group) => (
                <section key={group.label}>
                  <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#d6a738]">{group.label}</h2>
                  <div className="grid gap-1">
                    {group.items.map((item) => {
                      const active = item.href === activeItem?.href;
                      return (
                        <Link
                          key={`${item.module}-${item.href}`}
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => menuRef.current?.removeAttribute('open')}
                          className={`flex min-h-11 items-center border px-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d6a738] ${
                            active
                              ? 'border-[#d6a738] bg-[#c99c38] text-[#080604]'
                              : 'border-white/10 bg-white/[0.04] text-[#f1e9d7] hover:border-[#c99c38]/50 hover:bg-[#251c0e]'
                          }`}
                        >
                          {getMobileLabel(item)}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </details>
      </div>
    </nav>
  );
}
