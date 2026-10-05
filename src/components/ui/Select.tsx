import { fieldClasses } from '@/lib/ui-classes';
import { cn } from '@/lib/utils';

/*
 * Square, hairline border, 44px tall, and a focus outline that is never
 * removed — see Input.tsx for what this replaced.
 */

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const invalid = props['aria-invalid'] === true || props['aria-invalid'] === 'true';

  return <select {...props} className={cn(fieldClasses({ invalid }), props.className)} />;
}
