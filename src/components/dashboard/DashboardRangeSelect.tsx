'use client';

import { CalendarDays, ChevronDown } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type DashboardRangeOption = {
  label: string;
  value: string;
};

export function DashboardRangeSelect({
  paramName,
  value,
  options,
}: {
  paramName: 'range' | 'analytics';
  value: string;
  options: DashboardRangeOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(nextValue: string) {
    const params = new URLSearchParams(searchParams.toString());

    params.set(paramName, nextValue);

    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="relative inline-flex items-center">
      <CalendarDays className="pointer-events-none absolute left-4 size-4 text-[#c99c38]" />

      <select
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        className="h-11 min-w-44 appearance-none rounded-2xl border border-neutral-200 bg-white pl-11 pr-10 text-sm font-black text-neutral-700 shadow-sm outline-none transition hover:border-[#c99c38]/60 focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <ChevronDown className="pointer-events-none absolute right-4 size-4 text-neutral-400" />
    </div>
  );
}