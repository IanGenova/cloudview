import Link from 'next/link';
import { Role } from '@prisma/client';
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

type SidebarSubItem = {
  href: string;
  label: string;
  roles: readonly Role[];
};

type SidebarItem = {
  href?: string;
  label: string;
  icon: LucideIcon;
  roles: readonly Role[];
  children?: readonly SidebarSubItem[];
};

const items: readonly SidebarItem[] = [
  {
    href: '/dashboard',
    label: 'Overview',
    icon: LayoutDashboard,
    roles: [Role.SUPER_ADMIN, Role.HOTEL_ADMIN, Role.STAFF, Role.KITCHEN],
  },
  {
    href: '/dashboard/hotels',
    label: 'Hotels',
    icon: Hotel,
    roles: [Role.SUPER_ADMIN],
  },
  {
  href: '/dashboard/hotel-guide',
  label: 'Hotel Guide',
  icon: BookOpen,
  roles: [Role.SUPER_ADMIN, Role.HOTEL_ADMIN],
  },
  {
    href: '/dashboard/locations',
    label: 'Rooms & Locations',
    icon: BedDouble,
    roles: [Role.SUPER_ADMIN, Role.HOTEL_ADMIN],
  },
  {
    href: '/dashboard/tags',
    label: 'NFC Tags',
    icon: RadioTower,
    roles: [Role.SUPER_ADMIN, Role.HOTEL_ADMIN],
  },
  {
    href: '/dashboard/menu',
    label: 'Menu',
    icon: Utensils,
    roles: [Role.SUPER_ADMIN, Role.HOTEL_ADMIN],
  },
  {
    href: '/dashboard/inventory',
    label: 'Inventory',
    icon: Boxes,
    roles: [Role.SUPER_ADMIN, Role.HOTEL_ADMIN, Role.STAFF],
  },
  {
    href: '/dashboard/orders',
    label: 'Orders',
    icon: ShoppingBag,
    roles: [Role.SUPER_ADMIN, Role.HOTEL_ADMIN, Role.STAFF, Role.KITCHEN],
  },
  {
    href: '/dashboard/kitchen',
    label: 'Kitchen Display',
    icon: ChefHat,
    roles: [Role.SUPER_ADMIN, Role.HOTEL_ADMIN, Role.STAFF, Role.KITCHEN],
  },
  {
  href: '/dashboard/services',
  label: 'Services Module',
  icon: Wrench,
  roles: [Role.SUPER_ADMIN, Role.HOTEL_ADMIN],
  },
  {
    href: '/dashboard/service-requests',
    label: 'Service Requests',
    icon: ConciergeBell,
    roles: [Role.SUPER_ADMIN, Role.HOTEL_ADMIN, Role.STAFF],
  },
  {
    href: '/dashboard/pos',
    label: 'POS Terminal',
    icon: CreditCard,
    roles: [Role.SUPER_ADMIN, Role.HOTEL_ADMIN],
  },
  {
    href: '/dashboard/analytics',
    label: 'Analytics',
    icon: BarChart3,
    roles: [Role.SUPER_ADMIN, Role.HOTEL_ADMIN],
  },
  {
    label: 'Settings',
    icon: Settings,
    roles: [Role.SUPER_ADMIN, Role.HOTEL_ADMIN],
    children: [
            {
              href: '/dashboard/settings',
              label: 'Hotel Settings',
              roles: [Role.SUPER_ADMIN, Role.HOTEL_ADMIN],
            },
            {
              href: '/dashboard/settings/users',
              label: 'User Account Settings',
              roles: [Role.SUPER_ADMIN, Role.HOTEL_ADMIN],
            },
          ],
  },
];

export function Sidebar({
  role,
  hotelName,
}: {
  role: Role;
  hotelName?: string;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 self-start overflow-y-auto border-r border-neutral-200 bg-white p-5 lg:block">
      <Link
        href="/dashboard"
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
        {items
          .filter((item) => item.roles.includes(role))
          .map((item) => {
            const Icon = item.icon;

            const visibleChildren = item.children?.filter((child) =>
              child.roles.includes(role)
            );

            if (visibleChildren?.length) {
              return (
                <details key={item.label} className="group" open>
                  <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl px-4 py-3 text-sm font-bold text-neutral-700 hover:bg-cream hover:text-ink [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center gap-3">
                      <Icon className="size-4" />
                      {item.label}
                    </span>

                    <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                  </summary>

                  <div className="ml-6 mt-1 space-y-1 border-l border-neutral-200 pl-3">
                    {visibleChildren.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="block rounded-2xl px-4 py-2 text-sm font-black text-neutral-900 hover:bg-cream hover:text-ink"
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </details>
              );
            }

            if (!item.href) {
              return null;
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-neutral-700 hover:bg-cream hover:text-ink"
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
      </nav>
    </aside>
  );
}