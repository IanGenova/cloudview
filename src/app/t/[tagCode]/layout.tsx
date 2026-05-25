import type { ReactNode } from 'react';
import { NfcBrowserSessionGuard } from '@/components/guest/NfcBrowserSessionGuard';

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

  return (
    <>
      <NfcBrowserSessionGuard tagCode={tagCode} />
      {children}
    </>
  );
}