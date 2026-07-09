'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  Bell,
  ConciergeBell,
  Home,
  ShoppingBag,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type GuestHotel = {
  name: string;
  logoUrl?: string | null;
};

type GuestNavKey = 'home' | 'order' | 'services' | 'profile';

export function GuestLogo({
  hotel,
  compact = false,
  className = '',
}: {
  hotel: GuestHotel;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 text-center',
        compact ? 'flex-row' : 'flex-col',
        className
      )}
    >
      {hotel.logoUrl ? (
        <Image
          src={hotel.logoUrl}
          alt={hotel.name}
          width={compact ? 34 : 54}
          height={compact ? 34 : 54}
          className="rounded-2xl bg-white object-cover"
        />
      ) : (
        <div
          className={cn(
            'grid place-items-center rounded-2xl border border-gold/40 bg-black/20 text-gold',
            compact ? 'size-9' : 'size-14'
          )}
        >
          <span className="text-xl leading-none">☁</span>
        </div>
      )}

      <div>
        <p
          className={cn(
            'font-black uppercase tracking-[0.25em]',
            compact ? 'text-[10px]' : 'text-xs'
          )}
        >
          Cloud View
        </p>

        <p
          className={cn(
            'uppercase tracking-[0.2em] text-gold/80',
            compact ? 'text-[8px]' : 'text-[10px]'
          )}
        >
          Resort & Hotel
        </p>
      </div>
    </div>
  );
}

export function GuestTopBar({
  title,
  subtitle,
  backHref,
  dark = false,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  dark?: boolean;
}) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 grid grid-cols-[44px_1fr_44px] items-center px-4 py-4 backdrop-blur-xl',
        dark ? 'bg-black/70 text-white' : 'bg-[#f8f3ec]/85 text-ink'
      )}
    >
      {backHref ? (
        <Link
          href={backHref}
          className={cn(
            'grid size-10 place-items-center rounded-full',
            dark ? 'hover:bg-white/10' : 'hover:bg-black/5'
          )}
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" />
        </Link>
      ) : (
        <div />
      )}

      <div className="min-w-0 text-center">
        <h1 className="truncate font-black leading-tight">{title}</h1>
        {subtitle ? (
          <p
            className={cn(
              'truncate text-xs',
              dark ? 'text-white/60' : 'text-neutral-500'
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        className={cn(
          'grid size-10 place-items-center rounded-full',
          dark ? 'hover:bg-white/10' : 'hover:bg-black/5'
        )}
        aria-label="Notifications"
      >
        <Bell className="size-5" />
      </button>
    </header>
  );
}

export function GuestShell({
  hotel,
  title,
  subtitle,
  children,
  variant = 'light',
  backHref,
  showTopBar = true,
}: {
  hotel: GuestHotel;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  variant?: 'light' | 'dark';
  backHref?: string;
  showTopBar?: boolean;
}) {
  const dark = variant === 'dark';

  return (
    <main
      className={cn(
        'min-h-screen',
        dark ? 'bg-neutral-950 text-white' : 'bg-[#f8f3ec] text-ink'
      )}
    >
      <div
        className={cn(
          'mx-auto min-h-screen max-w-md shadow-soft',
          dark ? 'bg-black' : 'bg-[#f8f3ec]'
        )}
      >
        {showTopBar ? (
          <GuestTopBar
            title={title}
            subtitle={subtitle}
            backHref={backHref}
            dark={dark}
          />
        ) : null}

        <section className="px-5 pb-28 pt-3">{children}</section>
      </div>
    </main>
  );
}

const navItems = [
  {
    key: 'home',
    label: 'Home',
    href: (tagCode: string) => `/t/${tagCode}`,
    icon: Home,
  },
  {
    key: 'order',
    label: 'Order',
    href: (tagCode: string) => `/t/${tagCode}/menu`,
    icon: ShoppingBag,
  },
  {
    key: 'services',
    label: 'Services',
    href: (tagCode: string) => `/t/${tagCode}/service`,
    icon: ConciergeBell,
  },
  {
    key: 'profile',
    label: 'Profile',
    href: (tagCode: string) => `/t/${tagCode}/contact`,
    icon: UserRound,
  },
] as const;

function normalizePathname(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function isRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function resolveActiveGuestNav(
  pathname: string,
  tagCode: string
): GuestNavKey {
  const normalizedPathname = normalizePathname(pathname);
  const basePath = `/t/${tagCode}`;

  // Hotel Guide belongs to Home, including section-detail routes.
  if (
    normalizedPathname === basePath ||
    isRoute(normalizedPathname, `${basePath}/guide`)
  ) {
    return 'home';
  }

  if (
    isRoute(normalizedPathname, `${basePath}/menu`) ||
    isRoute(normalizedPathname, `${basePath}/order`) ||
    isRoute(normalizedPathname, `${basePath}/orders`) ||
    isRoute(normalizedPathname, `${basePath}/cart`)
  ) {
    return 'order';
  }

  if (
    isRoute(normalizedPathname, `${basePath}/service`) ||
    isRoute(normalizedPathname, `${basePath}/services`)
  ) {
    return 'services';
  }

  if (
    isRoute(normalizedPathname, `${basePath}/contact`) ||
    isRoute(normalizedPathname, `${basePath}/profile`) ||
    isRoute(normalizedPathname, `${basePath}/account`) ||
    isRoute(normalizedPathname, `${basePath}/rewards`)
  ) {
    return 'profile';
  }

  return 'home';
}

export function GuestBottomNav({
  tagCode,
  active,
  dark = false,
}: {
  tagCode: string;
  active?: GuestNavKey;
  dark?: boolean;
}) {
  const pathname = usePathname();

  // Pathname wins over a stale or incorrect manually supplied active prop.
  const resolvedActive = pathname
    ? resolveActiveGuestNav(pathname, tagCode)
    : active ?? 'home';

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      aria-label="Guest portal navigation"
    >
      <div
        className={cn(
          'grid grid-cols-4 gap-1 rounded-[1.75rem] border p-2 shadow-soft backdrop-blur-xl',
          dark
            ? 'border-white/10 bg-neutral-950/90 text-white'
            : 'border-black/5 bg-white/95 text-neutral-500'
        )}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = resolvedActive === item.key;

          return (
            <Link
              key={item.key}
              href={item.href(tagCode)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'grid min-h-14 place-items-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-bold transition active:scale-95',
                isActive
                  ? dark
                    ? 'bg-white/[0.04] text-gold'
                    : 'bg-black/[0.04] text-ink'
                  : dark
                    ? 'text-white/65 hover:text-white'
                    : 'text-neutral-500 hover:text-neutral-900'
              )}
            >
              <Icon
                className={cn(
                  'size-5',
                  isActive ? 'stroke-[2.25]' : 'stroke-[1.8]'
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
