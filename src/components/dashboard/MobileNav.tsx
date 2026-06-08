'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type DashboardNavItem = {
  module: string;
  label: string;
  href: string;
  group?: 'main' | 'settings';
};

const mobileLabelMap: Record<string, string> = {
  OVERVIEW: 'Home',
  HOTELS: 'Hotels',
  HOTEL_GUIDE: 'Guide',
  ROOMS_LOCATIONS: 'Rooms',
  NFC_TAGS: 'NFC Tags',
  MENU: 'Menu',
  INVENTORY: 'Inventory',
  ORDERS: 'Orders',
  KITCHEN_DISPLAY: 'Kitchen',
  SERVICES_MODULE: 'Services',
  SERVICE_REQUESTS: 'Requests',
  POS_TERMINAL: 'POS',
  ANALYTICS: 'Analytics',
  HOTEL_SETTINGS: 'Hotel Settings',
  USER_ACCOUNT_SETTINGS: 'Users',
};

function getMobileLabel(item: DashboardNavItem) {
  return mobileLabelMap[item.module] ?? item.label;
}

function isActiveRoute(pathname: string, href: string) {
  if (href === '/dashboard') {
    return pathname === '/dashboard';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
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

  if (!navItems.length) {
    return null;
  }

  return (
    <div className="sticky top-0 z-40 border-b border-[#2b2416] bg-[#090806]/95 p-3 shadow-[0_14px_35px_rgba(0,0,0,0.35)] backdrop-blur lg:hidden">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {navItems.map((item) => {
          const active = isActiveRoute(pathname, item.href);

          return (
            <Link
              key={item.module}
              href={item.href}
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
    </div>
  );
}