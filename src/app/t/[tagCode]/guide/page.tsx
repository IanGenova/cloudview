import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BedDouble,
  Car,
  ChevronRight,
  Clock,
  HelpCircle,
  Hotel,
  Info,
  MapPin,
  Phone,
  Search,
  Shield,
  Utensils,
  Waves,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import { db } from '@/lib/db';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';

const fallbackImage =
  'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=800&q=80';

const iconMap: Record<string, LucideIcon> = {
  Info,
  Wifi,
  BedDouble,
  Hotel,
  MapPin,
  Utensils,
  Car,
  Phone,
  Clock,
  Waves,
  Search,
  Shield,
  HelpCircle,
};

function resolveHref(tagCode: string, href?: string | null) {
  if (!href) {
    return '#';
  }

  if (href.startsWith('http://') || href.startsWith('https://')) {
    return href;
  }

  if (href.startsWith('/')) {
    return href;
  }

  return `/t/${tagCode}/${href.replace(/^\/+/, '')}`;
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{
    tagCode: string;
  }>;
}) {
  const { tagCode } = await params;

  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag || tag.status !== 'ACTIVE') {
    notFound();
  }

  const s = tag.hotel.settings;

  const sections = await db.hotelGuideSection.findMany({
    where: {
      hotelId: tag.hotelId,
      isActive: true,
    },
    include: {
      items: {
        where: {
          isActive: true,
        },
        orderBy: [
          {
            sortOrder: 'asc',
          },
          {
            title: 'asc',
          },
        ],
      },
    },
    orderBy: [
      {
        sortOrder: 'asc',
      },
      {
        title: 'asc',
      },
    ],
  });

  return (
    <>
      <GuestShell
        hotel={tag.hotel}
        title="Hotel Guide"
        subtitle="Everything you need during your stay"
        backHref={`/t/${tagCode}`}
      >
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
          <Search className="size-5 text-neutral-400" />
          <span className="text-sm text-neutral-400">Search information</span>
        </div>

        {sections.length ? (
          <div className="space-y-3">
            {sections.map((section) => {
              const Icon = iconMap[section.iconKey] ?? Info;

              return (
                <Link
                  key={section.id}
                  href={`#section-${section.id}`}
                  className="grid grid-cols-[76px_1fr_24px] items-center gap-4 rounded-2xl bg-white p-3 shadow-sm"
                >
                  <div
                    className="relative size-[76px] overflow-hidden rounded-2xl bg-neutral-100 bg-cover bg-center"
                    style={{
                      backgroundImage: `url(${section.imageUrl || fallbackImage})`,
                    }}
                  >
                    <div className="absolute inset-0 bg-black/10" />
                    <Icon className="absolute bottom-2 right-2 size-4 text-white" />
                  </div>

                  <span>
                    <span className="block font-black">{section.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-neutral-500">
                      {section.subtitle ||
                        section.description ||
                        'Tap to view information'}
                    </span>
                  </span>

                  <ChevronRight className="size-5 text-neutral-400" />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[2rem] bg-white p-5 shadow-sm">
            <h3 className="font-black">Hotel Guide not available</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Hotel guide content has not been configured yet. Please contact
              the front desk.
            </p>
          </div>
        )}

        <div id="hotel-info" className="mt-5 space-y-3">
          <InfoCard
            icon={Wifi}
            title="Wi-Fi"
            body={`Network: ${s?.wifiName ?? 'Ask front desk'}\nPassword: ${
              s?.wifiPassword ?? 'Ask front desk'
            }`}
          />

          <InfoCard
            icon={BedDouble}
            title="Check-in / Check-out"
            body={`Check-in: ${s?.checkInTime ?? '2:00 PM'}\nCheck-out: ${
              s?.checkOutTime ?? '12:00 PM'
            }`}
          />
        </div>

        <div className="mt-5 space-y-4 pb-10">
          {sections.map((section) => {
            const SectionIcon = iconMap[section.iconKey] ?? Info;

            return (
              <section
                key={section.id}
                id={`section-${section.id}`}
                className="scroll-mt-5"
              >
                <div className="rounded-[2rem] bg-white p-5 shadow-sm">
                  <h2 className="flex items-center gap-2 text-lg font-black">
                    <SectionIcon className="size-5 text-gold" />
                    {section.title}
                  </h2>

                  {section.description ? (
                    <p className="mt-2 text-sm leading-6 text-neutral-600">
                      {section.description}
                    </p>
                  ) : null}

                  <div className="mt-4 space-y-3">
                    {section.items.map((item) => {
                      const ItemIcon = iconMap[item.iconKey] ?? Info;
                      const href = resolveHref(tagCode, item.buttonHref);

                      return (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4"
                        >
                          <h3 className="flex items-center gap-2 font-black">
                            <ItemIcon className="size-4 text-gold" />
                            {item.title}
                          </h3>

                          {item.subtitle ? (
                            <p className="mt-1 text-xs font-bold text-neutral-500">
                              {item.subtitle}
                            </p>
                          ) : null}

                          {item.content ? (
                            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-neutral-600">
                              {item.content}
                            </p>
                          ) : null}

                          <div className="mt-3 space-y-1 text-xs font-bold text-neutral-500">
                            {item.hours ? <p>Hours: {item.hours}</p> : null}
                            {item.location ? (
                              <p>Location: {item.location}</p>
                            ) : null}
                            {item.contact ? (
                              <p>Contact: {item.contact}</p>
                            ) : null}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.buttonLabel && item.buttonHref ? (
                              <Link
                                href={href}
                                className="rounded-full bg-ink px-4 py-2 text-xs font-black text-white"
                              >
                                {item.buttonLabel}
                              </Link>
                            ) : null}

                            {item.mapUrl ? (
                              <Link
                                href={item.mapUrl}
                                className="rounded-full bg-white px-4 py-2 text-xs font-black text-ink"
                              >
                                Open Map
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}

                    {!section.items.length ? (
                      <p className="text-sm text-neutral-500">
                        No guide items available in this section.
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </GuestShell>

      <GuestBottomNav tagCode={tagCode} active="profile" />
    </>
  );
}

function InfoCard({
  title,
  body,
  icon: Icon,
}: {
  title: string;
  body: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-[2rem] bg-white p-5 shadow-sm">
      <h3 className="flex items-center gap-2 font-black">
        <Icon className="size-5 text-gold" />
        {title}
      </h3>
      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-neutral-600">
        {body}
      </p>
    </div>
  );
}