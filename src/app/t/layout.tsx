import { NfcBrowserSessionGuard } from '@/components/guest/NfcBrowserSessionGuard';

export default async function GuestTagLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ tagCode: string }>;
}) {
  const { tagCode } = await params;

  return (
    <>
      <NfcBrowserSessionGuard tagCode={tagCode} />
      {children}
    </>
  );
}