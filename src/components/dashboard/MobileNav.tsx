import Link from 'next/link';

export function MobileNav() {
  return (
    <div className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 p-3 backdrop-blur lg:hidden">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {[
          ['Home', '/dashboard'],
          ['Orders', '/dashboard/orders'],
          ['Kitchen', '/dashboard/kitchen'],
          ['Requests', '/dashboard/service-requests'],
          ['Menu', '/dashboard/menu'],
          ['Inventory', '/dashboard/inventory']
        ].map(([label, href]) => (
          <Link key={href} href={href} className="shrink-0 rounded-full bg-neutral-100 px-4 py-2 text-sm font-bold">{label}</Link>
        ))}
      </div>
    </div>
  );
}
