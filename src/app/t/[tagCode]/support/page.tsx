import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Mail,
  MessageCircle,
  Phone,
  ReceiptText,
  ShoppingBag,
  UserRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { GuestBottomNav } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';

export const dynamic = 'force-dynamic';

export default async function HelpSupportPage({
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

  const phone = tag.hotel.settings?.contactPhone;
  const email = tag.hotel.settings?.contactEmail;

  const location = tag.room
    ? `Room ${tag.room.number}`
    : tag.location?.name ?? tag.label;

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto min-h-screen max-w-md bg-black px-5 pb-32 pt-5">
        <div className="mb-7 grid grid-cols-[44px_1fr_44px] items-center">
          <Link
            href={`/t/${tagCode}/contact`}
            className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10"
            aria-label="Back"
          >
            <ChevronLeft className="size-6" />
          </Link>

          <div className="text-center">
            <h1 className="text-xl font-black">Help & Support</h1>
            <p className="text-sm text-white/45">{location}</p>
          </div>

          <div />
        </div>

        <section className="rounded-[2rem] border border-gold/20 bg-gold/10 p-5">
          <div className="flex items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold/15 text-gold">
              <HelpCircle className="size-6" />
            </div>

            <div>
              <p className="text-sm font-bold text-white/50">
                Need assistance?
              </p>
              <h2 className="mt-1 text-2xl font-black text-white">
                We are here to help
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/50">
                Contact the front desk, follow up an order, check your service
                request, or ask for room assistance.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3">
          {phone ? (
            <SupportAction
              href={`tel:${phone}`}
              icon={Phone}
              title="Call Front Desk"
              description={phone}
              strong
            />
          ) : null}

          {email ? (
            <SupportAction
              href={`mailto:${email}`}
              icon={Mail}
              title="Email Front Desk"
              description={email}
            />
          ) : null}

          <SupportAction
            href={`/t/${tagCode}/service`}
            icon={Wrench}
            title="Request Room Assistance"
            description="Housekeeping, toiletries, maintenance, amenities, and other support."
          />

          <SupportAction
            href={`/t/${tagCode}/orders`}
            icon={ShoppingBag}
            title="Follow Up My Orders"
            description="View your food and drink order history and tracking."
          />

          <SupportAction
            href={`/t/${tagCode}/requests`}
            icon={MessageCircle}
            title="Check My Requests"
            description="View your service requests, add-ons, and billing status."
          />
        </section>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="size-5 text-gold" />
            <h2 className="font-black">Urgent Concerns</h2>
          </div>

          <div className="space-y-3">
            <HelpCard
              icon={UserRound}
              title="Guest safety or emergency"
              body="Call the front desk immediately or approach the nearest hotel staff."
            />

            <HelpCard
              icon={ReceiptText}
              title="Billing or room charge concern"
              body="Check My Requests or contact the front desk for clarification about room add-ons."
            />

            <HelpCard
              icon={ShoppingBag}
              title="Delayed order"
              body="Open My Orders and check the latest order status. You may also contact the front desk."
            />
          </div>
        </section>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center gap-2">
            <HelpCircle className="size-5 text-gold" />
            <h2 className="font-black">Quick FAQ</h2>
          </div>

          <div className="space-y-3">
            <FaqItem
              question="Where can I see my food order?"
              answer="Open My Orders from your Profile. Tap an order to view its live tracking page."
            />

            <FaqItem
              question="Where can I see my room add-on charges?"
              answer="Open My Requests. Billable service requests will show as BILLED with the room add-on amount."
            />

            <FaqItem
              question="How do I ask for towels, toiletries, or maintenance?"
              answer="Open Request Room Assistance and choose one or more services."
            />

            <FaqItem
              question="What if my request has a price?"
              answer="Paid add-ons will clearly show the charge before submission. Some services may require staff confirmation first."
            />
          </div>
        </section>

        <Link
          href={`/t/${tagCode}/contact`}
          className="mt-6 block rounded-2xl bg-white/8 p-4 text-center font-black text-sand"
        >
          Back to Profile
        </Link>
      </div>

      <GuestBottomNav tagCode={tagCode} active="profile" dark />
    </main>
  );
}

function SupportAction({
  href,
  icon: Icon,
  title,
  description,
  strong,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  strong?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        strong
          ? 'grid grid-cols-[44px_1fr_24px] items-center gap-3 rounded-[1.5rem] bg-gold p-4 text-ink'
          : 'grid grid-cols-[44px_1fr_24px] items-center gap-3 rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-white hover:bg-white/10'
      }
    >
      <div
        className={
          strong
            ? 'grid size-11 place-items-center rounded-2xl bg-black/10'
            : 'grid size-11 place-items-center rounded-2xl bg-white/5 text-gold'
        }
      >
        <Icon className="size-5" />
      </div>

      <div>
        <p className="font-black">{title}</p>
        <p
          className={
            strong
              ? 'mt-1 text-xs font-bold text-black/60'
              : 'mt-1 text-xs leading-5 text-white/45'
          }
        >
          {description}
        </p>
      </div>

      <ChevronRight
        className={strong ? 'size-5 text-black/50' : 'size-5 text-white/35'}
      />
    </Link>
  );
}

function HelpCard({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl bg-white/5 p-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-gold" />
        <div>
          <p className="font-black">{title}</p>
          <p className="mt-1 text-sm leading-6 text-white/45">{body}</p>
        </div>
      </div>
    </div>
  );
}

function FaqItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  return (
    <div className="rounded-2xl bg-white/5 p-4">
      <p className="font-black">{question}</p>
      <p className="mt-2 text-sm leading-6 text-white/45">{answer}</p>
    </div>
  );
}