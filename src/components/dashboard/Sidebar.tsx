'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  BedDouble,
  BookOpen,
  Boxes,
  ChefHat,
  ChevronDown,
  ConciergeBell,
  CreditCard,
  FileBarChart2,
  Gift,
  Home,
  Hotel,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  RadioTower,
  Settings,
  ShieldCheck,
  ShoppingBag,
  UserCheck,
  Utensils,
  Wrench,
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
  description: string;
  modules: string[];
};

type BuiltSidebarGroup = SidebarGroup & {
  items: DashboardNavItem[];
};

const SETTINGS_GROUP_KEY = '__settings__';

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
    label: 'Dashboard',
    description: 'Overview, reports, and performance',
    modules: ['OVERVIEW', 'ANALYTICS', 'REPORTS'],
  },
  {
    label: 'Hotel Setup',
    description: 'Property, guide, rooms, and NFC',
    modules: ['HOTELS', 'HOTEL_GUIDE', 'ROOMS_LOCATIONS', 'NFC_TAGS'],
  },
  {
    label: 'Guest Service',
    description: 'Stays, orders, kitchen, and requests',
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
    label: 'Sales & Stock',
    description: 'Menu, inventory, and POS',
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

function buildGroupedNavItems(items: DashboardNavItem[]): BuiltSidebarGroup[] {
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
      label: 'More Tools',
      description: 'Additional assigned modules',
      modules: otherItems.map((item) => item.module),
      items: otherItems,
    });
  }

  return groups;
}

function SidebarLink({
  item,
  pathname,
  isSidebarOpen = true,
}: {
  item: DashboardNavItem;
  pathname: string;
  isSidebarOpen?: boolean;
}) {
  const Icon = getModuleIcon(item.module);
  const active = isActiveRoute(pathname, item.href);

  return (
    <Link
      href={item.href}
      title={!isSidebarOpen ? item.label : undefined}
      aria-label={!isSidebarOpen ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'group/link relative flex items-center overflow-hidden rounded-2xl text-[13px] font-black transition-all duration-200',
        isSidebarOpen
          ? 'min-h-11 gap-3 px-3 py-2.5'
          : 'mx-auto size-12 justify-center p-0',
        active
          ? 'bg-gradient-to-r from-[var(--cv-accent-hover)] via-[var(--cv-accent)] to-[var(--cv-accent-strong)] text-[var(--cv-on-accent)] shadow-[0_12px_30px_rgba(214,167,56,0.28)]'
          : 'text-[var(--cv-sidebar-text)] hover:bg-white/[0.065] hover:text-[var(--cv-sidebar-text-strong)]'
      )}
    >
      {active ? (
        <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-[var(--cv-on-accent)]" />
      ) : (
        <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-[var(--cv-accent)] opacity-0 transition-opacity group-hover/link:opacity-100" />
      )}

      <span
        className={cx(
          'relative z-10 grid shrink-0 place-items-center rounded-xl transition',
          isSidebarOpen ? 'size-8' : 'size-9',
          active
            ? 'bg-black/15 text-[var(--cv-on-accent)]'
            : 'bg-white/[0.055] text-[var(--cv-accent)] group-hover/link:bg-[var(--cv-accent)]/15 group-hover/link:text-[var(--cv-accent-hover)]'
        )}
      >
        <Icon className="size-4" />
      </span>

      {isSidebarOpen ? (
        <span className="relative z-10 min-w-0 flex-1 truncate">
          {item.label}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarSection({
  group,
  pathname,
  open,
  onToggle,
  isSidebarOpen = true,
}: {
  group: BuiltSidebarGroup;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  isSidebarOpen?: boolean;
}) {
  const hasActiveItem = group.items.some((item) =>
    isActiveRoute(pathname, item.href)
  );

  if (!isSidebarOpen) {
    return (
      <section className="space-y-1.5 pb-2">
        {group.items.map((item) => (
          <SidebarLink
            key={`${group.label}-${item.module}`}
            item={item}
            pathname={pathname}
            isSidebarOpen={false}
          />
        ))}
      </section>
    );
  }

  return (
    <section className="rounded-[1.35rem]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cx(
          'mb-1 flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left transition',
          hasActiveItem
            ? 'bg-white/[0.06] text-[var(--cv-sidebar-text-strong)]'
            : 'text-[var(--cv-sidebar-text)] hover:bg-white/[0.045] hover:text-[var(--cv-sidebar-text-strong)]'
        )}
      >
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-black uppercase tracking-[0.08em] text-[var(--cv-accent)]">
            {group.label}
          </span>
          <span className="mt-0.5 block text-[10px] font-bold text-[var(--cv-sidebar-muted)]">
            {group.description}
          </span>
        </span>

        <ChevronDown
          className={cx(
            'size-4 shrink-0 text-[var(--cv-accent-strong)] transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {open ? (
        <div className="space-y-1.5 pb-3">
          {group.items.map((item) => (
            <SidebarLink
              key={`${group.label}-${item.module}`}
              item={item}
              pathname={pathname}
              isSidebarOpen={isSidebarOpen}
            />
          ))}
        </div>
      ) : null}
    </section>
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    const savedPreference = window.localStorage.getItem(
      'cloudview-sidebar-open'
    );

    if (savedPreference === 'false') {
      setIsSidebarOpen(false);
    }
  }, []);

  function toggleSidebarOpen() {
    setIsSidebarOpen((current) => {
      const next = !current;
      window.localStorage.setItem('cloudview-sidebar-open', String(next));
      return next;
    });
  }

  const originalMainItems = useMemo(
    () => navItems.filter((item) => item.group !== 'settings'),
    [navItems]
  );

  const mainItems = useMemo(
    () => insertGuestStaysItem(insertReportsItem(originalMainItems)),
    [originalMainItems]
  );

  const groupedMainItems = useMemo(
    () => buildGroupedNavItems(mainItems),
    [mainItems]
  );

  const settingsItems = useMemo(
    () => navItems.filter((item) => item.group === 'settings'),
    [navItems]
  );

  const homeHref =
    navItems.find((item) => item.module === 'OVERVIEW')?.href ??
    navItems[0]?.href ??
    '/dashboard';

  const hasActiveSettings = settingsItems.some((item) =>
    isActiveRoute(pathname, item.href)
  );

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();

    for (const group of groupedMainItems) {
      const hasActiveItem = group.items.some((item) =>
        isActiveRoute(pathname, item.href)
      );

      if (hasActiveItem || group.label === 'Dashboard') {
        initial.add(group.label);
      }
    }

    if (hasActiveSettings) {
      initial.add(SETTINGS_GROUP_KEY);
    }

    return initial;
  });

  useEffect(() => {
    setOpenGroups((current) => {
      const next = new Set(current);
      let changed = false;

      for (const group of groupedMainItems) {
        const hasActiveItem = group.items.some((item) =>
          isActiveRoute(pathname, item.href)
        );

        if (hasActiveItem && !next.has(group.label)) {
          next.add(group.label);
          changed = true;
        }
      }

      if (hasActiveSettings && !next.has(SETTINGS_GROUP_KEY)) {
        next.add(SETTINGS_GROUP_KEY);
        changed = true;
      }

      return changed ? next : current;
    });
  }, [pathname, groupedMainItems, hasActiveSettings]);

  function toggleGroup(key: string) {
    setOpenGroups((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  const moduleCount = mainItems.length + settingsItems.length;

  return (
    <aside
      className={cx(
        'sticky top-0 hidden h-screen shrink-0 self-start overflow-hidden border-r border-[var(--cv-sidebar-border)] bg-[var(--cv-sidebar-bg)] text-white shadow-[18px_0_55px_rgba(0,0,0,0.36)] transition-[width] duration-300 ease-in-out lg:flex lg:flex-col',
        isSidebarOpen ? 'w-[292px]' : 'w-[88px]'
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,var(--cv-sidebar-glow)_0%,var(--cv-sidebar-strong)_38%,var(--cv-sidebar-bg)_100%)]" />
      <div className="pointer-events-none absolute -right-24 top-20 size-56 rounded-full bg-[var(--cv-accent)]/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 bottom-20 size-56 rounded-full bg-[var(--cv-accent)]/8 blur-3xl" />

      <div
        className={cx(
          'relative z-10 flex h-full min-h-0 flex-col',
          isSidebarOpen ? 'p-4' : 'items-center p-3'
        )}
      >
        <div
          className={cx(
            'mb-4 flex shrink-0 gap-2',
            isSidebarOpen ? 'items-start' : 'flex-col items-center'
          )}
        >
          <Link
            href={homeHref}
            title={!isSidebarOpen ? 'CloudView' : undefined}
            aria-label={!isSidebarOpen ? 'CloudView home' : undefined}
            className={cx(
              'overflow-hidden border border-[var(--cv-accent)]/30 bg-white/[0.045] shadow-[0_16px_42px_rgba(0,0,0,0.35)] backdrop-blur transition hover:border-[#f1c66a]/60 hover:bg-white/[0.065]',
              isSidebarOpen
                ? 'min-w-0 flex-1 rounded-[1.75rem] p-3.5'
                : 'grid size-14 place-items-center rounded-2xl p-0'
            )}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[var(--cv-accent-hover)] via-[var(--cv-accent)] to-[var(--cv-accent-strong)] text-[var(--cv-on-accent)] shadow-[0_12px_24px_rgba(214,167,56,0.28)]">
                <Home className="size-5" />
              </span>

              {isSidebarOpen ? (
                <span className="min-w-0">
                  <span className="block truncate text-base font-black tracking-tight text-white">
                    CloudView
                  </span>
                  <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--cv-sidebar-text)]">
                    {hotelName || 'Super Admin'}
                  </span>
                </span>
              ) : null}
            </div>

            {isSidebarOpen ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[var(--cv-accent)]/15 bg-black/20 px-3 py-2">
                <p className="truncate text-[9px] font-black uppercase tracking-[0.22em] text-[var(--cv-accent)]">
                  Admin Portal
                </p>

                <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-300">
                  Active
                </span>
              </div>
            ) : null}
          </Link>

          <button
            type="button"
            onClick={toggleSidebarOpen}
            title={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            aria-expanded={isSidebarOpen}
            className="grid size-10 shrink-0 place-items-center rounded-2xl border border-[var(--cv-accent)]/25 bg-white/[0.055] text-[var(--cv-accent)] transition hover:border-[#f1c66a]/55 hover:bg-[var(--cv-accent)]/15 hover:text-[var(--cv-accent-hover)]"
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
          </button>
        </div>

        <div
          className={cx(
            'mb-3 flex shrink-0 items-center px-2',
            isSidebarOpen ? 'justify-between' : 'justify-center'
          )}
        >
          {isSidebarOpen ? (
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--cv-sidebar-muted)]">
              Menu
            </p>
          ) : null}

          <span className="rounded-full border border-[var(--cv-accent)]/20 bg-white/[0.045] px-2 py-1 text-[10px] font-black text-[var(--cv-accent)]">
            {moduleCount}
          </span>
        </div>

        <nav
          className={cx(
            'min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            isSidebarOpen ? 'w-full pr-1' : 'w-full px-0'
          )}
        >
          {groupedMainItems.length > 0 ? (
            <div className="space-y-1 pb-4">
              {groupedMainItems.map((group) => (
                <SidebarSection
                  key={group.label}
                  group={group}
                  pathname={pathname}
                  open={openGroups.has(group.label)}
                  onToggle={() => toggleGroup(group.label)}
                  isSidebarOpen={isSidebarOpen}
                />
              ))}

              {settingsItems.length > 0 ? (
                isSidebarOpen ? (
                  <section className="pt-1">
                    <button
                      type="button"
                      onClick={() => toggleGroup(SETTINGS_GROUP_KEY)}
                      aria-expanded={openGroups.has(SETTINGS_GROUP_KEY)}
                      className={cx(
                        'mb-1 flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left transition',
                        hasActiveSettings
                          ? 'bg-white/[0.06] text-[var(--cv-sidebar-text-strong)]'
                          : 'text-[var(--cv-sidebar-text)] hover:bg-white/[0.045] hover:text-[var(--cv-sidebar-text-strong)]'
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white/[0.055] text-[var(--cv-accent)]">
                          <Settings className="size-4" />
                        </span>

                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-black uppercase tracking-[0.08em] text-[var(--cv-accent)]">
                            Admin Setup
                          </span>
                          <span className="mt-0.5 block text-[10px] font-bold text-[var(--cv-sidebar-muted)]">
                            Hotel and user access
                          </span>
                        </span>
                      </span>

                      <ChevronDown
                        className={cx(
                          'size-4 shrink-0 text-[var(--cv-accent-strong)] transition-transform',
                          openGroups.has(SETTINGS_GROUP_KEY) && 'rotate-180'
                        )}
                      />
                    </button>

                    {openGroups.has(SETTINGS_GROUP_KEY) ? (
                      <div className="space-y-1.5 pb-3">
                        {settingsItems.map((item) => (
                          <SidebarLink
                            key={item.module}
                            item={item}
                            pathname={pathname}
                            isSidebarOpen={isSidebarOpen}
                          />
                        ))}
                      </div>
                    ) : null}
                  </section>
                ) : (
                  <section className="space-y-1.5 pt-1 pb-3">
                    {settingsItems.map((item) => (
                      <SidebarLink
                        key={item.module}
                        item={item}
                        pathname={pathname}
                        isSidebarOpen={false}
                      />
                    ))}
                  </section>
                )
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--cv-accent-strong)]/30 bg-[var(--cv-sidebar-strong)] p-4 text-sm font-bold text-[var(--cv-sidebar-text)]">
              No dashboard modules assigned.
            </div>
          )}
        </nav>

        <div
          className={cx(
            'mt-3 shrink-0 overflow-hidden rounded-[1.5rem] border border-[var(--cv-accent)]/20 bg-white/[0.045] p-3 backdrop-blur',
            isSidebarOpen ? 'w-full' : 'w-14'
          )}
        >
          <div
            className={cx(
              'flex items-center gap-3',
              !isSidebarOpen && 'justify-center'
            )}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-black/35 text-[var(--cv-accent)]">
              <ShieldCheck className="size-5" />
            </span>

            {isSidebarOpen ? (
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--cv-accent)]">
                  Access Control
                </p>
                <p className="mt-0.5 truncate text-xs font-semibold text-[var(--cv-sidebar-text)]">
                  Role-based menu
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}