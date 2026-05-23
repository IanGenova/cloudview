import Link from 'next/link';
import { Role } from '@prisma/client';
import { BarChart3, BedDouble, Boxes, ChefHat, ConciergeBell, CreditCard, Home, Hotel, LayoutDashboard, RadioTower, Settings, ShoppingBag, Utensils } from 'lucide-react';

const items = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF', 'KITCHEN'] },
  { href: '/dashboard/hotels', label: 'Hotels', icon: Hotel, roles: ['SUPER_ADMIN'] },
  { href: '/dashboard/locations', label: 'Rooms & Locations', icon: BedDouble, roles: ['SUPER_ADMIN', 'HOTEL_ADMIN'] },
  { href: '/dashboard/tags', label: 'NFC Tags', icon: RadioTower, roles: ['SUPER_ADMIN', 'HOTEL_ADMIN'] },
  { href: '/dashboard/menu', label: 'Menu', icon: Utensils, roles: ['SUPER_ADMIN', 'HOTEL_ADMIN'] },
  { href: '/dashboard/inventory', label: 'Inventory', icon: Boxes, roles: ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF'] },
  { href: '/dashboard/orders', label: 'Orders', icon: ShoppingBag, roles: ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF', 'KITCHEN'] },
  { href: '/dashboard/kitchen', label: 'Kitchen Display', icon: ChefHat, roles: ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF', 'KITCHEN'] },
  { href: '/dashboard/service-requests', label: 'Service Requests', icon: ConciergeBell, roles: ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF'] },
  { href: '/dashboard/pos', label: 'POS Terminal', icon: CreditCard, roles: ['SUPER_ADMIN', 'HOTEL_ADMIN'] },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3, roles: ['SUPER_ADMIN', 'HOTEL_ADMIN'] },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, roles: ['SUPER_ADMIN', 'HOTEL_ADMIN'] }
] as const;

export function Sidebar({ role, hotelName }: { role: Role; hotelName?: string }) {
  return (
    <aside className="hidden min-h-screen w-72 shrink-0 border-r border-neutral-200 bg-white p-5 lg:block">
      <Link href="/dashboard" className="mb-8 flex items-center gap-3 rounded-3xl bg-ink p-4 text-white">
        <span className="grid size-11 place-items-center rounded-2xl bg-gold"><Home className="size-5" /></span>
        <span>
          <span className="block text-lg font-black">Cloud View</span>
          <span className="block text-xs text-white/70">{hotelName || 'Super Admin'}</span>
        </span>
      </Link>
      <nav className="space-y-1">
        {items.filter((item) => item.roles.includes(role)).map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-neutral-700 hover:bg-cream hover:text-ink">
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
