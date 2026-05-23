'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

function revokeSession(tagCode: string) {
  try {
    const payload = JSON.stringify({ tagCode });

    const blob = new Blob([payload], {
      type: 'application/json'
    });

    navigator.sendBeacon('/api/nfc/revoke', blob);
  } catch {
    fetch('/api/nfc/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tagCode }),
      keepalive: true
    }).catch(() => {});
  }
}

export function NfcBrowserSessionGuard({ tagCode }: { tagCode: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
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

    const browserSessionIsActive = sessionStorage.getItem(storageKey) === 'active';

    if (!browserSessionIsActive) {
      revokeSession(tagCode);

      router.replace(
        `/nfc-access-denied?tag=${encodeURIComponent(tagCode)}&reason=browser-reopened`
      );
    }
  }, [pathname, router, searchParams, tagCode]);

  return null;
}