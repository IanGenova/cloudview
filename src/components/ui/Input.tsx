import { fieldClasses } from '@/lib/ui-classes';
import { cn } from '@/lib/utils';

/*
 * Square, hairline border, 44px tall, and a focus outline that is never
 * removed. This primitive used to set `outline-none` and rely on
 * `focus:ring-4 ring-gold/20` — a ring measuring 1.19:1, where a focus
 * indicator needs 3:1.
 *
 * `aria-invalid` draws the error on the control itself, because every
 * checkout validation message used to be written into one shared banner
 * roughly 725px below the field it was about.
 */

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const invalid = props['aria-invalid'] === true || props['aria-invalid'] === 'true';

  return <input {...props} className={cn(fieldClasses({ invalid }), props.className)} />;
}
