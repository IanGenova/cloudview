import { cn } from '@/lib/utils';

const tones = {
  neutral: 'bg-neutral-100 text-neutral-700',
  gold: 'bg-yellow-100 text-yellow-800',
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-blue-100 text-blue-800'
};

export function Badge({ className, tone = 'neutral', ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return <span className={cn('inline-flex rounded-full px-3 py-1 text-xs font-bold', tones[tone], className)} {...props} />;
}
