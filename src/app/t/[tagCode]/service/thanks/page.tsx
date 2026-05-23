import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { db } from '@/lib/db';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';

export default async function ServiceThanksPage({ params, searchParams }: { params: Promise<{ tagCode: string }>; searchParams: Promise<{ code?: string }> }) {
  const { tagCode } = await params;
  const { code } = await searchParams;
  const tag = await requireNfcGuestAccess(tagCode);
  if (!tag) notFound();

  return (
    <>
      <GuestShell hotel={tag.hotel} title="Request Sent" subtitle={`Reference: ${code ?? 'Submitted'}`} backHref={`/t/${tagCode}/service`}>
        <div className="grid min-h-[65vh] place-items-center text-center">
          <div>
            <div className="mx-auto grid size-24 place-items-center rounded-full bg-green-100 text-green-700"><CheckCircle2 className="size-12" /></div>
            <h2 className="mt-6 text-3xl font-black">Staff has received your request.</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-600">A hotel team member will handle it shortly. Please keep this reference number for follow-up.</p>
            <Link href={`/t/${tagCode}`} className="mt-7 block rounded-2xl bg-ink p-4 text-center font-black text-white">Back to Home</Link>
          </div>
        </div>
      </GuestShell>
      <GuestBottomNav tagCode={tagCode} active="services" />
    </>
  );
}
