import {
  LockKeyhole,
  RefreshCcw,
  ShieldAlert,
} from 'lucide-react';

function messageForReason(reason?: string) {
  switch (reason) {
    case 'browser-reopened':
    case 'session-complete':
      return 'This browser tab no longer has an active NFC session. Please tap the official NFC panel again to start a fresh secure session.';

    case 'expired':
      return 'Your NFC access session expired because it was inactive or reached its security time limit.';

    /*
      These three are not the guest's fault and must not be worded as though
      they were. A device-mismatch fires whenever the browser's user agent
      changes — a browser update, switching to "Request desktop site", or an
      in-app browser handing the page to Safari or Chrome. Falling through to
      the default copy told the guest that copied and shared links are blocked,
      which reads as an accusation for something they did not do.
    */
    case 'device-mismatch':
      return 'For your security this session is linked to the browser you first tapped with, and your browser has changed. Nothing is wrong — just tap the panel again to continue where you left off.';

    case 'network-mismatch':
      return 'Your connection changed since you tapped, so this session was closed for your security. Tap the panel again to carry on.';

    case 'idle-timeout':
      return 'This session paused after a period of inactivity, which keeps your room details private. Tap the panel again to pick up where you left off.';

    case 'no-session':
      return 'This page can only be opened after tapping the official NFC panel. Direct guest portal links are not accepted.';

    case 'invalid-session':
      return 'This NFC access session is invalid, revoked, or already expired.';

    case 'bad-secret':
      return 'This NFC launch link is invalid. Please tap the official NFC panel again.';

    case 'inactive-tag':
      return 'This NFC tag is inactive or no longer available. Please contact the front desk.';

    case 'inactive-hotel':
      return 'Guest NFC access for this hotel is currently paused. Please contact the front desk.';

    case 'tag-not-found':
      return 'This NFC link does not match a current tag record. Refresh the NFC Tags dashboard or tap the newly programmed hotel NFC panel.';

    case 'room-required':
      return 'This NFC tag is not connected to a valid room. Please contact the front desk.';

    case 'no-active-stay':
      return 'No active guest stay was found for this room. Please contact the front desk.';

    case 'session-check-failed':
      return 'CloudView could not verify the current NFC session. Check your connection, then tap the NFC panel again.';

    default:
      return 'Direct links, copied URLs, expired sessions, and shared guest portal links are blocked for guest security.';
  }
}

function titleForReason(reason?: string) {
  switch (reason) {
    case 'inactive-hotel':
      return 'Hotel Guest Access Paused';

    case 'tag-not-found':
      return 'NFC Link Needs Refresh';

    case 'inactive-tag':
    case 'room-required':
    case 'no-active-stay':
      return 'NFC Access Unavailable';

    case 'session-check-failed':
      return 'Unable to Verify Session';

    /*
      A neutral heading for the cases the guest did not cause. "Tap NFC Again"
      as a bare command reads as a rejection when the guest was mid-task.
    */
    case 'device-mismatch':
    case 'network-mismatch':
      return 'Let’s Reconnect You';

    case 'idle-timeout':
      return 'Session Paused';

    default:
      return 'Tap NFC Again';
  }
}

export default async function NfcAccessDeniedPage({
  searchParams,
}: {
  searchParams?: Promise<{
    tag?: string;
    reason?: string;
  }>;
}) {
  const params = await searchParams;
  const reason = params?.reason;
  const tagCode = params?.tag;
  const isConnectionError = reason === 'session-check-failed';

  return (
    <main
      className="relative grid min-h-screen place-items-center overflow-hidden px-5 py-8"
      style={{
        backgroundColor: '#050505',
        backgroundImage:
          'radial-gradient(circle at top, rgba(214, 167, 56, 0.18), transparent 36%)',
        color: '#ffffff',
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full blur-3xl"
        style={{ backgroundColor: 'rgba(214, 167, 56, 0.10)' }}
      />

      <section
        className="relative z-10 w-full max-w-md overflow-hidden rounded-[2rem] border shadow-2xl"
        style={{
          backgroundColor: '#111111',
          borderColor: 'rgba(255,255,255,0.10)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
        }}
      >
        <div
          className="border-b p-7 text-center"
          style={{ borderColor: 'rgba(255,255,255,0.09)' }}
        >
          <div
            className="mx-auto grid size-16 place-items-center rounded-2xl border"
            style={{
              backgroundColor: 'rgba(214,167,56,0.12)',
              borderColor: 'rgba(214,167,56,0.28)',
              color: '#d6a738',
            }}
          >
            {isConnectionError ? (
              <ShieldAlert className="size-7" />
            ) : (
              <LockKeyhole className="size-7" />
            )}
          </div>

          <p
            className="mt-5 text-[10px] font-black uppercase tracking-[0.2em]"
            style={{ color: '#d6a738' }}
          >
            CloudView Secure Access
          </p>

          <h1
            className="mt-2 font-serif text-3xl font-normal tracking-wide"
            style={{ color: '#ffffff' }}
          >
            {titleForReason(reason)}
          </h1>

          <p
            className="mt-3 text-sm font-medium leading-6"
            style={{ color: 'rgba(255,255,255,0.62)' }}
          >
            {messageForReason(reason)}
          </p>
        </div>

        <div className="space-y-3 p-5">
          <div
            className="flex items-start gap-3 rounded-[1.35rem] border p-4"
            style={{
              backgroundColor: '#1b1b1b',
              borderColor: 'rgba(255,255,255,0.09)',
            }}
          >
            <RefreshCcw
              className="mt-0.5 size-4 shrink-0"
              style={{ color: '#d6a738' }}
            />

            <p
              className="text-xs font-medium leading-5"
              style={{ color: 'rgba(255,255,255,0.58)' }}
            >
              Hold your phone near the room or hotel NFC panel, then open the
              official NFC notification again.
            </p>
          </div>

          {tagCode ? (
            <p
              className="text-center text-[10px] font-black uppercase tracking-[0.16em]"
              style={{ color: 'rgba(255,255,255,0.32)' }}
            >
              NFC Tag: {tagCode}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
