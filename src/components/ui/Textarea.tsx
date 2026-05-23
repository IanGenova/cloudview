import { cn } from '@/lib/utils';

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn('min-h-28 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 outline-none ring-gold/20 transition focus:ring-4', props.className)} />;
}
