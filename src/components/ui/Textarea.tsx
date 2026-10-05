import { fieldClasses } from '@/lib/ui-classes';
import { cn } from '@/lib/utils';

/*
 * Square, hairline border, and a focus outline that is never removed — see
 * Input.tsx for what this replaced. The minimum height is the textarea's own,
 * not the 44px tap floor, which it clears several times over.
 */

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const invalid = props['aria-invalid'] === true || props['aria-invalid'] === 'true';

  return (
    <textarea
      {...props}
      className={cn(fieldClasses({ invalid }), 'min-h-28', props.className)}
    />
  );
}
