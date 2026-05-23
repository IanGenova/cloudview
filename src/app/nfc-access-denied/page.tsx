import Link from 'next/link';

function messageForReason(reason?: string) {
  switch (reason) {
    case 'browser-reopened':
  return 'Your browser session was closed or restored from an old tab. Please tap the NFC panel again to start a fresh secure session.';
    case 'expired':
      return 'Your NFC access session has expired because the link was idle or reached its time limit.';
    case 'no-session':
      return 'This page can only be opened after tapping the official NFC panel.';
    case 'invalid-session':
      return 'This access session is invalid or already expired.';
    case 'bad-secret':
      return 'This NFC launch link is invalid. Please tap the official NFC panel again.';
    case 'inactive-tag':
      return 'This NFC tag is inactive or no longer available.';
    default:
      return 'Direct links, copied URLs, expired sessions, or shared links are blocked for guest security.';
  }
}

export default async function NfcAccessDeniedPage({
  searchParams
}: {
  searchParams?: Promise<{ tag?: string; reason?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-black px-5 text-white">
      <section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/5 p-8 text-center shadow-soft">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-gold text-2xl text-black">
          🔒
        </div>

        <h1 className="mt-6 text-3xl font-black">Tap NFC Again</h1>

        <p className="mt-3 text-sm leading-6 text-white/60">
          {messageForReason(params?.reason)}
        </p>

        <p className="mt-4 rounded-2xl bg-white/5 p-4 text-xs leading-6 text-white/50">
          For security, Cloud View guest portal sessions expire automatically after inactivity.
        </p>

      </section>
    </main>
  );
}