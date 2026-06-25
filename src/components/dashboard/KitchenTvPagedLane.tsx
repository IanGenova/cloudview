'use client';

import { Children, type ReactNode, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type KitchenLaneType = 'pending' | 'preparing' | 'ready';

function getLaneTheme(type: KitchenLaneType) {
  if (type === 'pending') {
    return 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10';
  }

  if (type === 'preparing') {
    return 'border-blue-200 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/10';
  }

  return 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10';
}

export function KitchenTvPagedLane({
  title,
  description,
  type,
  totalOrders,
  pageSize = 3,
  intervalMs = 10_000,
  children,
}: {
  title: string;
  description: string;
  type: KitchenLaneType;
  totalOrders: number;
  pageSize?: number;
  intervalMs?: number;
  children: ReactNode;
}) {
  const childItems = useMemo(() => Children.toArray(children), [children]);
  const pageCount = Math.max(Math.ceil(childItems.length / pageSize), 1);

  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    setCurrentPage(0);
  }, [childItems.length, pageSize]);

  useEffect(() => {
    if (pageCount <= 1) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setCurrentPage((page) => (page + 1) % pageCount);
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [intervalMs, pageCount]);

  const safePage = Math.min(currentPage, pageCount - 1);
  const startIndex = safePage * pageSize;
  const endIndex = Math.min(startIndex + pageSize, childItems.length);
  const visibleItems = childItems.slice(startIndex, endIndex);

  const showingStart = totalOrders > 0 ? startIndex + 1 : 0;
  const showingEnd = Math.min(endIndex, totalOrders);

  return (
    <section
      className={cn(
        'flex min-h-[calc(100dvh-220px)] flex-col overflow-hidden rounded-[2rem] border',
        getLaneTheme(type)
      )}
    >
      <div className="shrink-0 border-b border-black/5 px-5 py-5 dark:border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-4xl font-black text-neutral-950 dark:text-white">
              {title}
            </h2>

            <p className="mt-1 text-base font-semibold text-neutral-500 dark:text-neutral-400">
              {description}
            </p>

            <p className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-neutral-400">
              {totalOrders > 0
                ? `Showing ${showingStart}-${showingEnd} of ${totalOrders}`
                : 'No orders in queue'}
            </p>
          </div>

          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-black text-2xl font-black text-white dark:bg-gold dark:text-black">
            {totalOrders}
          </span>
        </div>

        {pageCount > 1 ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() =>
                setCurrentPage((page) => (page - 1 + pageCount) % pageCount)
              }
              className="grid size-9 place-items-center rounded-full bg-white/70 text-neutral-700 shadow-sm hover:bg-white dark:bg-neutral-950 dark:text-white"
              aria-label={`Previous ${title} page`}
            >
              <ChevronLeft className="size-4" />
            </button>

            <div className="flex flex-wrap justify-center gap-1.5">
              {Array.from({ length: pageCount }).map((_, index) => (
                <button
                  key={`${title}-page-${index}`}
                  type="button"
                  onClick={() => setCurrentPage(index)}
                  className={cn(
                    'h-2.5 rounded-full transition-all',
                    index === safePage
                      ? 'w-7 bg-black dark:bg-gold'
                      : 'w-2.5 bg-black/20 dark:bg-white/25'
                  )}
                  aria-label={`Go to ${title} page ${index + 1}`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCurrentPage((page) => (page + 1) % pageCount)}
              className="grid size-9 place-items-center rounded-full bg-white/70 text-neutral-700 shadow-sm hover:bg-white dark:bg-neutral-950 dark:text-white"
              aria-label={`Next ${title} page`}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-5">
        {visibleItems.length === 0 ? (
          <div className="grid h-full min-h-40 w-full place-items-center rounded-[1.5rem] border border-dashed border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-950">
            <p className="text-xl font-black text-neutral-500 dark:text-neutral-400">
              No {title.toLowerCase()} orders
            </p>
          </div>
        ) : (
          <div className="grid gap-4">{visibleItems}</div>
        )}
      </div>
    </section>
  );
}