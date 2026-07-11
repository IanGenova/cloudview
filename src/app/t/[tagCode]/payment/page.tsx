import { notFound } from 'next/navigation';
import {
  GuestPayMongoFlow,
  type Prisma,
} from '@prisma/client';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';
import { GuestPaymentStatus } from '@/components/guest/GuestPaymentStatus';
import type { GuestPaymentStatusValue } from './actions';
import { requireOwnedGuestPayMongoSession } from '@/lib/guest-paymongo-security';
import { requireNfcGuestAccess } from '@/lib/nfc-security';

export const dynamic = 'force-dynamic';

function parseFlow(value?: string) {
  if (value === 'food') return GuestPayMongoFlow.FOOD_ORDER;
  if (value === 'service') return GuestPayMongoFlow.SERVICE_REQUEST;
  return null;
}

function parseStringArray(value: Prisma.JsonValue | null) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export default async function GuestPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ tagCode: string }>;
  searchParams: Promise<{
    session?: string;
    flow?: string;
    result?: string;
  }>;
}) {
  const { tagCode } = await params;
  const query = await searchParams;
  const paymentSessionId = query.session?.trim();
  const flow = parseFlow(query.flow);

  if (!paymentSessionId || !flow) {
    notFound();
  }

  const tag = await requireNfcGuestAccess(tagCode);

  let ownedPayment: Awaited<
    ReturnType<typeof requireOwnedGuestPayMongoSession>
  >;

  try {
    ownedPayment = await requireOwnedGuestPayMongoSession({
      tagCode,
      paymentSessionId,
      flowType: flow,
    });
  } catch {
    notFound();
  }

  const { payment } = ownedPayment;

  const roomLabel = tag.room
    ? `Room ${tag.room.number}`
    : tag.location?.name ?? tag.label;

  const referenceCode =
    flow === GuestPayMongoFlow.FOOD_ORDER
      ? payment.orderCode
      : parseStringArray(payment.serviceRequestCodes)[0] || null;

  const returnResult =
    query.result === 'success' || query.result === 'cancelled'
      ? query.result
      : null;

  return (
    <>
      <GuestShell
        hotel={tag.hotel}
        title="Secure Payment"
        subtitle={roomLabel}
        backHref={
          flow === GuestPayMongoFlow.FOOD_ORDER
            ? `/t/${tagCode}/menu`
            : `/t/${tagCode}/service`
        }
        variant="dark"
      >
        <GuestPaymentStatus
          tagCode={tagCode}
          paymentSessionId={payment.id}
          flow={flow}
          returnResult={returnResult}
          initialStatus={payment.status as GuestPaymentStatusValue}
          initialReferenceCode={referenceCode}
          initialCheckoutUrl={payment.checkoutUrl}
          initialErrorMessage={
            payment.errorMessage || payment.refundErrorMessage
          }
          initialRefundStatus={payment.refundStatus}
          initialRefundedAmountCents={payment.refundedAmountCents}
          amountCents={payment.amountCents}
          currency={payment.currency}
          expiresAt={payment.expiresAt?.toISOString() ?? null}
        />
      </GuestShell>

      <GuestBottomNav
        tagCode={tagCode}
        active={
          flow === GuestPayMongoFlow.FOOD_ORDER ? 'order' : 'services'
        }
        dark
      />
    </>
  );
}
