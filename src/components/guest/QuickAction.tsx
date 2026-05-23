import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function QuickAction({
  href,
  icon: Icon,
  title,
  description,
  className = '',
  compact = false
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Link href={href} className={cn('rounded-2xl bg-white/95 p-4 text-center shadow-soft transition hover:scale-[1.02]', className)}>
        <span className="mx-auto grid size-9 place-items-center text-ink"><Icon className="size-5" /></span>
        <span className="mt-2 block text-xs font-black leading-tight text-ink">{title}</span>
      </Link>
    );
  }

  return (
    <Link href={href} className={cn('flex items-center gap-4 rounded-[1.5rem] bg-white p-4 shadow-soft transition hover:scale-[1.01]', className)}>
      <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-ink text-white"><Icon className="size-6" /></span>
      <span>
        <span className="block text-lg font-black">{title}</span>
        <span className="text-sm text-neutral-500">{description}</span>
      </span>
    </Link>
  );
}
