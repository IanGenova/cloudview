'use client';

import { useEffect } from 'react';

export function KitchenFocusOrderScroller({
  orderCode,
}: {
  orderCode?: string;
}) {
  useEffect(() => {
    const focusedOrderCode = orderCode?.trim();

    if (!focusedOrderCode) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const target = Array.from(
        document.querySelectorAll<HTMLElement>('[data-kitchen-order-code]')
      ).find(
        (element) => element.dataset.kitchenOrderCode === focusedOrderCode
      );

      if (!target) {
        return;
      }

      target.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });

      target.dataset.focusedKitchenOrder = 'true';

      window.setTimeout(() => {
        if (target.dataset.focusedKitchenOrder === 'true') {
          delete target.dataset.focusedKitchenOrder;
        }
      }, 8000);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [orderCode]);

  return null;
}
