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
  DatabaseBackup,
  FileBarChart2,
  Gift,
  Home,
  Hotel,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  RadioTower,
  Settings,
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
  modules: string[];
};

type BuiltSidebarGroup = SidebarGroup & {
  items: DashboardNavItem[];
};

const SETTINGS_GROUP_KEY = '__settings__';

const dataBackupNavItem: DashboardNavItem = {
  module: 'DATA_BACKUP',
  label: 'Data Backup & Recovery',
  href: '/dashboard/settings/backups',
  group: 'settings',
};

/*
 * IA-1, and decision 2, which is the owner's: the menu was a list of the
 * system's parts — Dashboard, Hotel Setup, Guest Service, Sales & Stock — so
 * finding anything meant knowing which subsystem a hotelier's question lived
 * in. Taking counter money, for instance, was split across Sales & Stock and
 * Guest Service with nothing linking them (IA-10).
 *
 * Group routes by the work they support so the label predicts what is inside.
 */
const navGroups: SidebarGroup[] = [
  {
    label: 'Daily Operations',
    modules: [
      'OVERVIEW',
      'ORDERS',
      'KITCHEN_DISPLAY',
      'SERVICE_REQUESTS',
      'POS_TERMINAL',
    ],
  },
  {
    label: 'Property & Guests',
    modules: [
      'HOTELS',
      'GUEST_STAYS',
      'ROOMS_LOCATIONS',
      'NFC_TAGS',
      'HOTEL_GUIDE',
      'REWARDS',
    ],
  },
  {
    label: 'Catalog & Stock',
    modules: ['MENU', 'SERVICES_MODULE', 'INVENTORY'],
  },
  {
    label: 'Insights',
    modules: ['ANALYTICS', 'REPORTS'],
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
  DATA_BACKUP: DatabaseBackup,
};

function getModuleIcon(module: string) {
  return moduleIconMap[module] ?? LayoutDashboard;
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

function getActiveHref(
  pathname: string,
  items: DashboardNavItem[]
): string | null {
  const matchedItems = items
    .filter((item) => routeMatches(pathname, item.href))
    .sort(
      (first, second) =>
        normalizeRoute(second.href).length -
        normalizeRoute(first.href).length
    );

  return matchedItems[0]?.href ?? null;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function insertDataBackupItem(
  settingsItems: DashboardNavItem[],
  allPermissionFilteredItems: DashboardNavItem[]
) {
  const hasBackupItem = settingsItems.some(
    (item) =>
      item.module === 'DATA_BACKUP' ||
      item.href === dataBackupNavItem.href
  );

  if (hasBackupItem) {
    return settingsItems;
  }

  /**
   * Permission safety:
   * navItems already comes from the permission-filtered dashboard layout.
   * Only expose Backup & Recovery when HOTEL_SETTINGS is present.
   */
  const canAccessHotelSettings = allPermissionFilteredItems.some(
    (item) => item.module === 'HOTEL_SETTINGS'
  );

  if (!canAccessHotelSettings) {
    return settingsItems;
  }

  const hotelSettingsIndex = settingsItems.findIndex(
    (item) => item.module === 'HOTEL_SETTINGS'
  );

  if (hotelSettingsIndex >= 0) {
    return [
      ...settingsItems.slice(0, hotelSettingsIndex + 1),
      dataBackupNavItem,
      ...settingsItems.slice(hotelSettingsIndex + 1),
    ];
  }

  return [...settingsItems, dataBackupNavItem];
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
      modules: otherItems.map((item) => item.module),
      items: otherItems,
    });
  }

  return groups;
}

function SidebarLink({
  item,
  activeHref,
  isSidebarOpen = true,
}: {
  item: DashboardNavItem;
  activeHref: string | null;
  isSidebarOpen?: boolean;
}) {
  const Icon = getModuleIcon(item.module);
  const active = item.href === activeHref;

  return (
    <Link
      href={item.href}
      title={!isSidebarOpen ? item.label : undefined}
      aria-label={!isSidebarOpen ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'group/link relative flex items-center overflow-hidden text-[13px] font-semibold transition-all duration-200',
        isSidebarOpen
          ? 'min-h-11 gap-3 px-3 py-2.5'
          : 'mx-auto size-12 justify-center p-0',
        active
          ? 'bg-[var(--cv-accent)] text-[var(--cv-on-accent)]'
          : 'text-[var(--cv-sidebar-text)] hover:bg-white/[0.065] hover:text-[var(--cv-sidebar-text-strong)]'
      )}
    >
      {active ? (
        <span className="absolute inset-y-2 left-0 w-1 bg-[var(--cv-on-accent)]" />
      ) : (
        <span className="absolute inset-y-2 left-0 w-1 bg-[var(--cv-accent)] opacity-0 transition-opacity group-hover/link:opacity-100" />
      )}

      <span
        className={cx(
          'relative z-10 grid shrink-0 place-items-center transition',
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
  activeHref,
  open,
  onToggle,
  isSidebarOpen = true,
}: {
  group: BuiltSidebarGroup;
  activeHref: string | null;
  open: boolean;
  onToggle: () => void;
  isSidebarOpen?: boolean;
}) {
  const hasActiveItem = group.items.some(
    (item) => item.href === activeHref
  );

  if (!isSidebarOpen) {
    return (
      <section
        aria-label={group.label}
        className="space-y-1.5 border-b border-white/10 pb-3 last:border-b-0"
      >
        {group.items.map((item) => (
          <SidebarLink
            key={`${group.label}-${item.module}`}
            item={item}
            activeHref={activeHref}
            isSidebarOpen={false}
          />
        ))}
      </section>
    );
  }

  return (
    <section aria-label={group.label}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cx(
          'mb-1 flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition',
          hasActiveItem
            ? 'bg-white/[0.06] text-[var(--cv-sidebar-text-strong)]'
            : 'text-[var(--cv-sidebar-text)] hover:bg-white/[0.045] hover:text-[var(--cv-sidebar-text-strong)]'
        )}
      >
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--cv-accent)]">
            {group.label}
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
              activeHref={activeHref}
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

  const mainItems = useMemo(
    () => navItems.filter((item) => item.group !== 'settings'),
    [navItems]
  );

  const groupedMainItems = useMemo(
    () => buildGroupedNavItems(mainItems),
    [mainItems]
  );

  const settingsItems = useMemo(
    () =>
      insertDataBackupItem(
        navItems.filter((item) => item.group === 'settings'),
        navItems
      ),
    [navItems]
  );

  const allSidebarItems = useMemo(
    () => [...mainItems, ...settingsItems],
    [mainItems, settingsItems]
  );

  const activeHref = useMemo(
    () => getActiveHref(pathname, allSidebarItems),
    [pathname, allSidebarItems]
  );

  const homeHref =
    navItems.find((item) => item.module === 'OVERVIEW')?.href ??
    navItems[0]?.href ??
    '/dashboard';

  const hasActiveSettings = settingsItems.some(
    (item) => item.href === activeHref
  );

  const activeGroupKey = hasActiveSettings
    ? SETTINGS_GROUP_KEY
    : groupedMainItems.find((group) =>
        group.items.some((item) => item.href === activeHref)
      )?.label ?? null;

  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(activeGroupKey ? [activeGroupKey] : [])
  );

  useEffect(() => {
    setOpenGroups((current) => {
      if (activeGroupKey && current.size === 1 && current.has(activeGroupKey)) {
        return current;
      }

      return new Set(activeGroupKey ? [activeGroupKey] : []);
    });
  }, [activeHref, activeGroupKey]);

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

  return (
    <aside
      className={cx(
        'sticky top-0 hidden h-screen shrink-0 self-start overflow-hidden border-r border-[var(--cv-sidebar-border)] bg-[var(--cv-sidebar-bg)] text-white transition-[width] duration-300 ease-in-out lg:flex lg:flex-col',
        isSidebarOpen ? 'w-[292px]' : 'w-[88px]'
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,var(--cv-sidebar-glow)_0%,var(--cv-sidebar-strong)_38%,var(--cv-sidebar-bg)_100%)]" />
      <div className="pointer-events-none absolute -right-24 top-20 size-56 bg-[var(--cv-accent)]/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 bottom-20 size-56 bg-[var(--cv-accent)]/8 blur-3xl" />

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
                ? 'min-w-0 flex-1 p-3.5'
                : 'grid size-14 place-items-center p-0'
            )}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center bg-[var(--cv-accent)] text-[var(--cv-on-accent)]">
                <Home className="size-5" />
              </span>

              {isSidebarOpen ? (
                <span className="min-w-0">
                  <span className="block truncate text-base font-semibold tracking-tight text-white">
                    CloudView
                  </span>
                  <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--cv-sidebar-text)]">
                    {hotelName || 'Super Admin'}
                  </span>
                </span>
              ) : null}
            </div>

          </Link>

          <button
            type="button"
            onClick={toggleSidebarOpen}
            title={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            aria-expanded={isSidebarOpen}
            className="grid size-10 shrink-0 place-items-center border border-[var(--cv-accent)]/25 bg-white/[0.055] text-[var(--cv-accent)] transition hover:border-[#f1c66a]/55 hover:bg-[var(--cv-accent)]/15 hover:text-[var(--cv-accent-hover)]"
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
          </button>
        </div>

        {isSidebarOpen ? (
          <p className="relative z-10 mb-3 shrink-0 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--cv-sidebar-muted)]">
            Navigation
          </p>
        ) : null}

        <nav
          className={cx(
            /*
              IA-2. This scrolled with the scrollbar hidden, so opening a group
              pushed up to six items out of sight with nothing on screen saying
              the list continued. A thin rule is enough of a cue and costs no
              layout.
            */
            'min-h-0 flex-1 overflow-y-auto [scrollbar-color:rgba(214,167,56,0.35)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:bg-[rgba(214,167,56,0.35)] [&::-webkit-scrollbar]:w-1.5',
            isSidebarOpen ? 'w-full pr-1' : 'w-full px-0'
          )}
        >
          {groupedMainItems.length > 0 || settingsItems.length > 0 ? (
            <div className="space-y-1 pb-4">
              {groupedMainItems.map((group) => (
                <SidebarSection
                  key={group.label}
                  group={group}
                  activeHref={activeHref}
                  open={openGroups.has(group.label)}
                  onToggle={() => toggleGroup(group.label)}
                  isSidebarOpen={isSidebarOpen}
                />
              ))}

              {settingsItems.length > 0 ? (
                isSidebarOpen ? (
                  <section aria-label="Settings" className="pt-1">
                    <button
                      type="button"
                      onClick={() => toggleGroup(SETTINGS_GROUP_KEY)}
                      aria-expanded={openGroups.has(SETTINGS_GROUP_KEY)}
                      className={cx(
                        'mb-1 flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition',
                        hasActiveSettings
                          ? 'bg-white/[0.06] text-[var(--cv-sidebar-text-strong)]'
                          : 'text-[var(--cv-sidebar-text)] hover:bg-white/[0.045] hover:text-[var(--cv-sidebar-text-strong)]'
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center bg-white/[0.055] text-[var(--cv-accent)]">
                          <Settings className="size-4" />
                        </span>

                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--cv-accent)]">
                            Settings
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
                            key={`${item.module}-${item.href}`}
                            item={item}
                            activeHref={activeHref}
                            isSidebarOpen={isSidebarOpen}
                          />
                        ))}
                      </div>
                    ) : null}
                  </section>
                ) : (
                  <section aria-label="Settings" className="space-y-1.5 pt-1 pb-3">
                    {settingsItems.map((item) => (
                      <SidebarLink
                        key={`${item.module}-${item.href}`}
                        item={item}
                        activeHref={activeHref}
                        isSidebarOpen={false}
                      />
                    ))}
                  </section>
                )
              ) : null}
            </div>
          ) : (
            <div className="border border-dashed border-[var(--cv-accent-strong)]/30 bg-[var(--cv-sidebar-strong)] p-4 text-sm font-bold text-[var(--cv-sidebar-text)]">
              No dashboard modules assigned.
            </div>
          )}
        </nav>

      </div>
    </aside>
  );
}
