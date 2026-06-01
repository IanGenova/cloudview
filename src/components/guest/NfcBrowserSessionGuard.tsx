'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

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
    });
  } catch {
    // Ignore revoke network errors. The server will verify again on next request.
  }
}

async function getServerSessionStatus(tagCode: string) {
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

  return response.json() as Promise<{
    hasSession: boolean;
    keepSession: boolean;
    pendingOrders: number;
    pendingServiceRequests: number;
    totalPending: number;
  }>;
}

export function NfcBrowserSessionGuard({ tagCode }: { tagCode: string }) {
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

    const browserSessionIsActive =
      sessionStorage.getItem(storageKey) === 'active';

    if (browserSessionIsActive) {
      return;
    }

    async function verifyReopenedBrowserSession() {
      const status = await getServerSessionStatus(tagCode);

      if (cancelled) {
        return;
      }

      /**
       * This is the important fix:
       * If the browser tab was closed but the guest still has active orders
       * or service requests, restore the browser session.
       */
      if (status?.hasSession && status.keepSession) {
        sessionStorage.setItem(storageKey, 'active');
        return;
      }

      await revokeSession(tagCode);

      if (cancelled) {
        return;
      }

      router.replace(
        `/nfc-access-denied?tag=${encodeURIComponent(
          tagCode
        )}&reason=session-complete`
      );
    }

    void verifyReopenedBrowserSession();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, searchParams, tagCode]);

  return null;
}