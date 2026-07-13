'use client';

import { useLayoutEffect } from 'react';

export function ResetGuestServiceRequest({
  tagCode,
  requestCode,
}: {
  tagCode: string;
  requestCode: string;
}) {
  useLayoutEffect(() => {
    const checkoutKey = `cv-service-checkout-${tagCode}`;
    const resetKey = `cv-service-reset-${tagCode}`;

    // Remove the completed cart immediately.
    sessionStorage.removeItem(checkoutKey);

    // Leave a one-time marker for GuestServiceOrderForm. When the guest opens
    // Services again, that page consumes this marker and resets all React state.
    sessionStorage.setItem(
      resetKey,
      JSON.stringify({
        requestCode,
        completedAt: Date.now(),
      })
    );

    // Covers any already-mounted/cached copy of the service form.
    window.dispatchEvent(
      new CustomEvent('cv-service-request-reset', {
        detail: { tagCode, requestCode },
      })
    );
  }, [requestCode, tagCode]);

  return null;
}
