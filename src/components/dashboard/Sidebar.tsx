'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  BedDouble,
  Boxes,
  ChefHat,
  ChevronDown,
  ConciergeBell,
  CreditCard,
  FileBarChart2,
  Gift,
  Home,
  Hotel,
  BookOpen,
  LayoutDashboard,
  RadioTower,
  Wrench,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Utensils,
   UserCheck,
  type LucideIcon,
} from 'lucide-react';

type DashboardNavItem = {
  module: string;
  label: string;
  href: string;
  group?: 'main' | 'settings';
};

type SidebarGroup = {
  label: string;
  modules: string[];
};

const reportsNavItem: DashboardNavItem = {
  module: 'REPORTS',
  label: 'Reports',
  href: '/dashboard/reports',
};

const guestStaysNavItem: DashboardNavItem = {
  module: 'GUEST_STAYS',
  label: 'Guest Stays',
  href: '/dashboard/guest-stays',
};

const navGroups: SidebarGroup[] = [
  {
    label: 'Command Center',
    modules: ['OVERVIEW', 'ANALYTICS', 'REPORTS'],
  },
  {
    label: 'Property Setup',
    modules: ['HOTELS', 'HOTEL_GUIDE', 'ROOMS_LOCATIONS', 'NFC_TAGS'],
  },
  {
    label: 'Guest Operations',
    modules: [
      'GUEST_STAYS',
      'ORDERS',
      'KITCHEN_DISPLAY',
      'SERVICES_MODULE',
      'SERVICE_REQUESTS',
      'REWARDS',
    ],
  },
  {
    label: 'Commerce & Inventory',
    modules: ['MENU', 'INVENTORY', 'POS_TERMINAL'],
  },
];

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
  GUEST_STAYS: UserCheck,
  REWARDS: Gift,
  REPORTS: FileBarChart2,
  HOTEL_SETTINGS: Settings,
  USER_ACCOUNT_SETTINGS: Settings,
};

function getModuleIcon(module: string) {
  return moduleIconMap[module] ?? LayoutDashboard;
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

function insertReportsItem(items: DashboardNavItem[]) {
  const hasReports = items.some(
    (item) => item.module === 'REPORTS' || item.href === '/dashboard/reports'
  );

  if (hasReports) {
    return items;
  }

  const analyticsIndex = items.findIndex((item) => item.module === 'ANALYTICS');

  if (analyticsIndex >= 0) {
    return [
      ...items.slice(0, analyticsIndex + 1),
      reportsNavItem,
      ...items.slice(analyticsIndex + 1),
    ];
  }

  return [...items, reportsNavItem];
}

function insertGuestStaysItem(items: DashboardNavItem[]) {
  const hasGuestStays = items.some(
    (item) =>
      item.module === 'GUEST_STAYS' || item.href === '/dashboard/guest-stays'
  );

  if (hasGuestStays) {
    return items;
  }

  const ordersIndex = items.findIndex((item) => item.module === 'ORDERS');

  if (ordersIndex >= 0) {
    return [
      ...items.slice(0, ordersIndex),
      guestStaysNavItem,
      ...items.slice(ordersIndex),
    ];
  }

  return [...items, guestStaysNavItem];
}

function sortItemsByGroupOrder(items: DashboardNavItem[], modules: string[]) {
  const moduleRank = new Map(modules.map((module, index) => [module, index]));

  return [...items].sort((a, b) => {
    const rankA = moduleRank.get(a.module) ?? 999;
    const rankB = moduleRank.get(b.module) ?? 999;

    return rankA - rankB;
  });
}

function buildGroupedNavItems(items: DashboardNavItem[]) {
  const usedModules = new Set<string>();

  const groups = navGroups
    .map((group) => {
      const groupItems = sortItemsByGroupOrder(
        items.filter((item) => group.modules.includes(item.module)),
        group.modules
      );

      groupItems.forEach((item) => usedModules.add(item.module));

      return {
        ...group,
        items: groupItems,
      };
    })
    .filter((group) => group.items.length > 0);

  const otherItems = items.filter((item) => !usedModules.has(item.module));

  if (otherItems.length > 0) {
    groups.push({
      label: 'Other Modules',
      modules: otherItems.map((item) => item.module),
      items: otherItems,
    });
  }

  return groups;
}

function SidebarLink({
  item,
  pathname,
  compact = false,
}: {
  item: DashboardNavItem;
  pathname: string;
  compact?: boolean;
}) {
  const Icon = getModuleIcon(item.module);
  const active = isActiveRoute(pathname, item.href);

  return (
    <Link
      href={item.href}
      className={cx(
        'group relative flex items-center gap-3 overflow-hidden rounded-2xl border text-[12.5px] font-black transition-all duration-200',
        compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
        active
          ? 'border-[#d6a738]/55 bg-gradient-to-r from-[#d6a738] via-[#bd8f2d] to-[#8d641c] text-[#080604] shadow-[0_12px_26px_rgba(201,156,56,0.25)]'
          : 'border-transparent text-[#ddd4bf] hover:border-[#c99c38]/35 hover:bg-[#191308] hover:text-[#f7e7bd]'
      )}
    >
      {!active ? (
        <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-[#c99c38]" />
          <span className="absolute inset-0 bg-gradient-to-r from-[#c99c38]/12 via-[#c99c38]/5 to-transparent" />
        </span>
      ) : null}

      <span
        className={cx(
          'relative z-10 grid shrink-0 place-items-center rounded-xl transition',
          compact ? 'size-7' : 'size-8',
          active
            ? 'bg-black/15 text-[#080604]'
            : 'bg-white/[0.045] text-[#c99c38] group-hover:bg-[#c99c38]/15 group-hover:text-[#f1c66a]'
        )}
      >
        <Icon className={compact ? 'size-3.5' : 'size-4'} />
      </span>

      <span className="relative z-10 truncate">{item.label}</span>
    </Link>
  );
}

function SidebarSection({
  group,
  pathname,
}: {
  group: SidebarGroup & {
    items: DashboardNavItem[];
  };
  pathname: string;
}) {
  const hasActiveItem = group.items.some((item) =>
    isActiveRoute(pathname, item.href)
  );

  return (
    <details
      className="group/section"
      open={hasActiveItem || group.label === 'Command Center'}
    >
      <summary className="mb-2 flex cursor-pointer list-none items-center justify-between rounded-2xl px-3 py-2 text-[#9d8f70] transition hover:bg-white/[0.045] hover:text-[#f1c66a] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-black uppercase tracking-[0.18em] text-[#d6a738]">
            {group.label}
          </span>
        </span>

        <ChevronDown className="size-4 shrink-0 text-[#c99c38] transition-transform group-open/section:rotate-180" />
      </summary>

      <div className="space-y-1.5 pb-3">
        {group.items.map((item) => (
          <SidebarLink
            key={`${group.label}-${item.module}`}
            item={item}
            pathname={pathname}
            compact
          />
        ))}
      </div>
    </details>
  );
}

export function Sidebar({
  hotelName,
  navItems = [],
}: {
  hotelName?: string;
  navItems?: DashboardNavItem[];
}) {
  const pathname = usePathname();

  const originalMainItems = navItems.filter((item) => item.group !== 'settings');
  const mainItems = insertGuestStaysItem(insertReportsItem(originalMainItems));
  const groupedMainItems = buildGroupedNavItems(mainItems);

  const settingsItems = navItems.filter((item) => item.group === 'settings');

  const homeHref = navItems[0]?.href ?? '/dashboard';

  const hasActiveSettings = settingsItems.some((item) =>
    isActiveRoute(pathname, item.href)
  );

  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 self-start overflow-hidden border-r border-[#2a2417] bg-[#080704] text-white shadow-[18px_0_55px_rgba(0,0,0,0.35)] lg:flex lg:flex-col">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,#2b210f_0%,#11100b_36%,#070604_100%)]" />

      <div className="relative z-10 flex h-full min-h-0 flex-col p-4">
        <Link
          href={homeHref}
          className="mb-4 shrink-0 overflow-hidden rounded-[1.5rem] border border-[#c99c38]/35 bg-[#0f0d09] p-3 shadow-[0_16px_38px_rgba(0,0,0,0.38)] transition hover:border-[#f1c66a]/60 hover:shadow-[0_20px_45px_rgba(201,156,56,0.14)]"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#f1c66a] via-[#c99c38] to-[#8f6820] text-[#070604] shadow-[0_10px_22px_rgba(201,156,56,0.25)]">
              <Home className="size-5" />
            </span>

            <span className="min-w-0">
              <span className="block truncate text-base font-black tracking-tight text-white">
                Cloud View
              </span>
              <span className="block truncate text-xs font-semibold text-[#b9aa88]">
                {hotelName || 'Super Admin'}
              </span>
            </span>
          </div>

          <div className="mt-3 h-px bg-gradient-to-r from-transparent via-[#c99c38]/45 to-transparent" />

          <p className="mt-2 text-[9px] font-black uppercase tracking-[0.24em] text-[#d6a738]">
            Hotel Operations Suite
          </p>
        </Link>

        <nav className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {groupedMainItems.length > 0 ? (
            <div className="space-y-1 pb-4">
              {groupedMainItems.map((group) => (
                <SidebarSection
                  key={group.label}
                  group={group}
                  pathname={pathname}
                />
              ))}

              {settingsItems.length > 0 ? (
                <details
                  className="group/settings pt-1"
                  open={hasActiveSettings}
                >
                  <summary
                    className={cx(
                      'flex cursor-pointer list-none items-center justify-between rounded-2xl border px-3 py-2.5 text-sm font-black transition [&::-webkit-details-marker]:hidden',
                      hasActiveSettings
                        ? 'border-[#c99c38]/40 bg-[#191308] text-[#f7e7bd]'
                        : 'border-transparent text-[#ddd4bf] hover:border-[#c99c38]/35 hover:bg-[#191308] hover:text-[#f7e7bd]'
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white/[0.045] text-[#c99c38]">
                        <Settings className="size-4" />
                      </span>

                      <span className="truncate">Settings</span>
                    </span>

                    <ChevronDown className="size-4 shrink-0 text-[#c99c38] transition-transform group-open/settings:rotate-180" />
                  </summary>

                  <div className="ml-5 mt-2 space-y-1 border-l border-[#c99c38]/20 pl-3">
                    {settingsItems.map((item) => {
                      const active = isActiveRoute(pathname, item.href);

                      return (
                        <Link
                          key={item.module}
                          href={item.href}
                          className={cx(
                            'block rounded-xl px-3 py-2 text-xs font-black transition',
                            active
                              ? 'bg-[#c99c38] text-[#070604] shadow-[0_10px_22px_rgba(201,156,56,0.16)]'
                              : 'text-[#c8bea7] hover:bg-[#191308] hover:text-[#f7e7bd]'
                          )}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </details>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#c99c38]/30 bg-[#11100c] p-4 text-sm font-bold text-[#b9aa88]">
              No dashboard modules assigned.
            </div>
          )}
        </nav>

        <div className="mt-3 shrink-0 rounded-2xl border border-[#c99c38]/20 bg-black/25 px-3 py-3">
          <div className="flex items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white/[0.045] text-[#c99c38]">
              <ShieldCheck className="size-4" />
            </span>

            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d6a738]">
                Secure Access
              </p>
              <p className="mt-0.5 truncate text-xs font-semibold text-[#b9aa88]">
                Permission-based modules
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}