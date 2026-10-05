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

/*
 * Decision 3, the owner's. The fourth tab was "Profile", which named a
 * database record rather than anything a guest has; it opened a page whose own
 * title was "My Stay" (IA-12). It is "My stay" now, and it goes to the screen
 * that actually holds a guest's stay — current orders, current requests, and
 * the history of both — rather than to a hub of links to those.
 */
type GuestNavKey = 'home' | 'order' | 'services' | 'stay';

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
          className="bg-white object-cover"
        />
      ) : (
        <div
          className={cn(
            'grid place-items-center border border-gold/40 bg-black/20 text-gold',
            compact ? 'size-9' : 'size-14'
          )}
        >
          {/*
            The only emoji anywhere in the product's chrome, standing in for a
            hotel that has not uploaded a logo — a cloud, which is the vendor's
            brand, on a screen meant to be the hotel's. Its initials say whose
            portal this is.
          */}
          <span className="font-serif text-base leading-none tracking-wide">
            {hotel.name
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((word) => word[0])
              .join('')
              .toUpperCase() || 'CV'}
          </span>
        </div>
      )}

      <div>
        <p
          className={cn(
            'font-semibold uppercase tracking-[0.25em]',
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
        'sticky top-0 z-30 grid grid-cols-[40px_minmax(0,1fr)_40px] items-center px-3 py-3 backdrop-blur-xl sm:grid-cols-[44px_minmax(0,1fr)_44px] sm:px-4 sm:py-4',
        dark ? 'bg-black/70 text-white' : 'bg-[#f8f3ec]/85 text-ink'
      )}
    >
      {backHref ? (
        <Link
          href={backHref}
          className={cn(
            'grid size-11 place-items-center',
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
        <h1 className="truncate font-semibold leading-tight">{title}</h1>
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
          'grid size-11 place-items-center',
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
        'min-h-dvh overflow-x-clip',
        dark ? 'bg-neutral-950 text-white' : 'bg-[#f8f3ec] text-ink'
      )}
    >
      <div
        className={cn(
          'mx-auto min-h-dvh w-full max-w-md',
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

        <section className="px-5 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-3">{children}</section>
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
    key: 'stay',
    label: 'My stay',
    href: (tagCode: string) => `/t/${tagCode}/activity`,
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

/*
 * IA-5. Four tabs cannot represent sixteen screens, but the worse half of that
 * finding was the last line of this function: anything it did not recognise
 * fell through to 'home', so a guest reading "My Requests" was told by the bar
 * that they were on the home screen. Every guest route is now accounted for,
 * and an unrecognised one marks nothing rather than marking the wrong thing.
 */
function resolveActiveGuestNav(
  pathname: string,
  tagCode: string
): GuestNavKey | null {
  const normalizedPathname = normalizePathname(pathname);
  const basePath = `/t/${tagCode}`;

  // The guide and the facility pages are things to read about the hotel.
  if (
    normalizedPathname === basePath ||
    isRoute(normalizedPathname, `${basePath}/guide`) ||
    isRoute(normalizedPathname, `${basePath}/pool`)
  ) {
    return 'home';
  }

  // Ordering food, and everything between the menu and the confirmation.
  if (
    isRoute(normalizedPathname, `${basePath}/menu`) ||
    isRoute(normalizedPathname, `${basePath}/order`) ||
    isRoute(normalizedPathname, `${basePath}/cart`) ||
    isRoute(normalizedPathname, `${basePath}/payment`) ||
    isRoute(normalizedPathname, `${basePath}/confirmed`)
  ) {
    return 'order';
  }

  if (
    isRoute(normalizedPathname, `${basePath}/service`) ||
    isRoute(normalizedPathname, `${basePath}/services`)
  ) {
    return 'services';
  }

  // Everything the guest already has going on, and who they are to the hotel.
  if (
    isRoute(normalizedPathname, `${basePath}/activity`) ||
    isRoute(normalizedPathname, `${basePath}/orders`) ||
    isRoute(normalizedPathname, `${basePath}/requests`) ||
    isRoute(normalizedPathname, `${basePath}/track`) ||
    isRoute(normalizedPathname, `${basePath}/contact`) ||
    isRoute(normalizedPathname, `${basePath}/profile`) ||
    isRoute(normalizedPathname, `${basePath}/account`) ||
    isRoute(normalizedPathname, `${basePath}/rewards`) ||
    isRoute(normalizedPathname, `${basePath}/support`)
  ) {
    return 'stay';
  }

  return null;
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
    : active ?? null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))]"
      aria-label="Guest portal navigation"
    >
      <div
        className={cn(
          'grid grid-cols-4 gap-1 border p-1.5 backdrop-blur-xl sm:p-2',
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
                'grid min-h-14 min-w-0 place-items-center gap-1 px-1 py-2 text-[9px] font-bold transition min-[360px]:text-[10px] sm:px-2',
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
