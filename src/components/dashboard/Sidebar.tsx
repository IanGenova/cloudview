import Link from 'next/link';
import {
  BarChart3,
  BedDouble,
  Boxes,
  ChefHat,
  ChevronDown,
  ConciergeBell,
  CreditCard,
  Home,
  Hotel,
  BookOpen,
  LayoutDashboard,
  RadioTower,
  Wrench,
  Settings,
  ShoppingBag,
  Utensils,
  type LucideIcon,
} from 'lucide-react';

type DashboardNavItem = {
  module: string;
  label: string;
  href: string;
  group?: 'main' | 'settings';
};

const moduleIconMap: Record<string, LucideIcon> = {
  OVERVIEW: LayoutDashboard,
  HOTELS: Hotel,
  HOTEL_GUIDE: BookOpen,
  ROOMS_LOCATIONS: BedDouble,
  NFC_TAGS: RadioTower,
  MENU: Utensils,
  INVENTORY: Boxes,
  ORDERS: ShoppingBag,
  KITCHEN_DISPLAY: ChefHat,
  SERVICES_MODULE: Wrench,
  SERVICE_REQUESTS: ConciergeBell,
  POS_TERMINAL: CreditCard,
  ANALYTICS: BarChart3,
  HOTEL_SETTINGS: Settings,
  USER_ACCOUNT_SETTINGS: Settings,
};

function getModuleIcon(module: string) {
  return moduleIconMap[module] ?? LayoutDashboard;
}

export function Sidebar({
  hotelName,
  navItems = [],
}: {
  hotelName?: string;
  navItems?: DashboardNavItem[];
}) {
  const mainItems = navItems.filter((item) => item.group !== 'settings');
  const settingsItems = navItems.filter((item) => item.group === 'settings');

  const homeHref = navItems[0]?.href ?? '/dashboard';

  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 self-start overflow-y-auto border-r border-neutral-200 bg-white p-5 lg:block">
      <Link
        href={homeHref}
        className="mb-8 flex items-center gap-3 rounded-3xl bg-ink p-4 text-white"
      >
        <span className="grid size-11 place-items-center rounded-2xl bg-gold">
          <Home className="size-5" />
        </span>

        <span>
          <span className="block text-lg font-black">Cloud View</span>
          <span className="block text-xs text-white/70">
            {hotelName || 'Super Admin'}
          </span>
        </span>
      </Link>

      <nav className="space-y-1">
        {mainItems.map((item) => {
          const Icon = getModuleIcon(item.module);

          return (
            <Link
              key={item.module}
              href={item.href}
              className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-neutral-700 hover:bg-cream hover:text-ink"
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}

        {settingsItems.length > 0 ? (
          <details className="group" open>
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl px-4 py-3 text-sm font-bold text-neutral-700 hover:bg-cream hover:text-ink [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-3">
                <Settings className="size-4" />
                Settings
              </span>

              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            </summary>

            <div className="ml-6 mt-1 space-y-1 border-l border-neutral-200 pl-3">
              {settingsItems.map((item) => (
                <Link
                  key={item.module}
                  href={item.href}
                  className="block rounded-2xl px-4 py-2 text-sm font-black text-neutral-900 hover:bg-cream hover:text-ink"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        ) : null}

        {!navItems.length ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-4 text-sm font-bold text-neutral-500">
            No dashboard modules assigned.
          </div>
        ) : null}
      </nav>
    </aside>
  );
}