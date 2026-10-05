import { redirect } from 'next/navigation';

/*
 * IA-7, and decision 3, which is the owner's.
 *
 * `/orders` and `/activity` were the same list twice. This one showed a
 * guest's food orders and called them "My Orders"; `/activity` showed the same
 * orders plus their service requests and called the guest by a different name
 * — "Guest" on one screen, "Maria Santos" on the other, for one person in one
 * stay. Two screens answering one question, and the guest's own navigation
 * reached neither.
 *
 * `/activity` is now "My stay" and holds everything. The audit promised that
 * no route would be removed, so this one stays and sends its traffic there:
 * old links, bookmarks and any QR code already printed keep working.
 */
export default async function GuestOrdersPage({
  params,
}: {
  params: Promise<{ tagCode: string }>;
}) {
  const { tagCode } = await params;

  redirect(`/t/${tagCode}/activity`);
}
