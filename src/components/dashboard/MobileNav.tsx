import Link from 'next/link';

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

export function MobileNav({
  navItems = [],
}: {
  navItems?: DashboardNavItem[];
}) {
  if (!navItems.length) {
    return null;
  }

  return (
    <div className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 p-3 backdrop-blur lg:hidden">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {navItems.map((item) => (
          <Link
            key={item.module}
            href={item.href}
            className="shrink-0 rounded-full bg-neutral-100 px-4 py-2 text-sm font-bold"
          >
            {getMobileLabel(item)}
          </Link>
        ))}
      </div>
    </div>
  );
}