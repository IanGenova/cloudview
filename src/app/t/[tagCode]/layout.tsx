import type { ReactNode } from 'react';
import { NfcBrowserSessionGuard } from '@/components/guest/NfcBrowserSessionGuard';
import { requireNfcGuestAccess } from '@/lib/nfc-security';

type GuestTagLayoutProps = {
  children: ReactNode;
  params: Promise<{
    tagCode: string;
  }>;
};

export default async function GuestTagLayout({
  children,
  params,
}: GuestTagLayoutProps) {
  const { tagCode } = await params;

  // Server-side gate for every guest portal page. The client guard remains for
  // browser-session lifecycle UX, but it is no longer the only protection.
  await requireNfcGuestAccess(tagCode);

  return (
    <>
      <NfcBrowserSessionGuard tagCode={tagCode} />
      {children}
    </>
  );
}