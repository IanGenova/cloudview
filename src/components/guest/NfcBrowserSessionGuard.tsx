'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type NfcSessionStatus = {
  hasSession: boolean;
  keepSession: boolean;
  pendingOrders: number;
  pendingServiceRequests: number;
  totalPending: number;
};

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function revokeSession(tagCode: string) {
  try {
    await fetch('/api/nfc/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tagCode }),
      keepalive: true,
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    // Ignore revoke network errors. The server validates cookies again later.
  }
}

async function getServerSessionStatus(
  tagCode: string
): Promise<NfcSessionStatus | null> {
  try {
    const response = await fetch(
      `/api/nfc/session-status?tagCode=${encodeURIComponent(tagCode)}`,
      {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      }
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as NfcSessionStatus;
  } catch {
    return null;
  }
}

export function NfcBrowserSessionGuard({
  tagCode,
}: {
  tagCode: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;

    const storageKey = `cloudview:nfc-browser-session:${tagCode}`;
    const cameFromNfc = searchParams.get('nfcSession') === '1';

    if (cameFromNfc) {
      sessionStorage.setItem(storageKey, 'active');

      const params = new URLSearchParams(window.location.search);
      params.delete('nfcSession');

      const nextUrl = params.toString()
        ? `${pathname}?${params.toString()}`
        : pathname;

      window.history.replaceState(null, '', nextUrl);
      return;
    }

    if (sessionStorage.getItem(storageKey) === 'active') {
      return;
    }

    async function verifyReopenedBrowserSession() {
      let status = await getServerSessionStatus(tagCode);

      if (!status) {
        await wait(700);

        if (cancelled) {
          return;
        }

        status = await getServerSessionStatus(tagCode);
      }

      if (cancelled) {
        return;
      }

      /**
       * A reopened browser may continue only while the server session still has
       * pending orders or service requests. This behavior is independent from
       * the hotel's room-passcode toggle.
       */
      if (status?.hasSession && status.keepSession) {
        sessionStorage.setItem(storageKey, 'active');
        return;
      }

      /**
       * Do not revoke a possibly valid server session when both status checks
       * failed because of a temporary network/server problem.
       */
      if (!status) {
        router.replace(
          `/nfc-access-denied?tag=${encodeURIComponent(
            tagCode
          )}&reason=session-check-failed`
        );
        return;
      }

      sessionStorage.removeItem(storageKey);
      await revokeSession(tagCode);

      if (cancelled) {
        return;
      }

      router.replace(
        `/nfc-access-denied?tag=${encodeURIComponent(
          tagCode
        )}&reason=browser-reopened`
      );
    }

    void verifyReopenedBrowserSession();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, searchParams, tagCode]);

  return null;
}
