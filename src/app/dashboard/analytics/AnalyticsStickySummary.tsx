'use client';

import { useEffect, useState } from 'react';

type SummaryStat = {
  label: string;
  value: string;
};

/**
 * Sticky key-figures band for the analytics report.
 *
 * The report runs to roughly thirteen screens on a phone. The hero metrics sit
 * at the very top, so the moment a manager scrolls to any chart the headline
 * numbers are gone and the only way back is to scroll all the way up.
 *
 * This band appears once the hero has scrolled past and keeps the same figures
 * pinned. It renders nothing until then, so the top of the page is unchanged.
 */
export function AnalyticsStickySummary({ stats }: { stats: SummaryStat[] }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      // Roughly the height of the hero block before the first chart.
      setVisible(window.scrollY > 420);
    }

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!stats.length) {
    return null;
  }

  return (
    <div
      aria-hidden={!visible}
      className={`sticky top-0 z-30 -mx-4 mb-4 border-b border-neutral-200 bg-white/95 px-4 py-2.5 backdrop-blur transition-all duration-200 dark:border-neutral-800 dark:bg-neutral-950/95 ${
        visible
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none -translate-y-2 opacity-0'
      }`}
    >
      <div className="flex items-center gap-4 overflow-x-auto">
        <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.16em] text-neutral-400">
          Key figures
        </span>

        <dl className="flex min-w-0 items-center gap-5">
          {stats.map((stat) => (
            <div key={stat.label} className="flex shrink-0 items-baseline gap-2">
              <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                {stat.label}
              </dt>
              <dd className="text-sm font-black tabular-nums text-neutral-900 dark:text-white">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="ml-auto shrink-0 rounded-full border border-neutral-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-neutral-600 transition hover:border-[#c99c38] hover:text-[#9d741f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c99c38] dark:border-neutral-700 dark:text-neutral-300"
        >
          Top
        </button>
      </div>
    </div>
  );
}
