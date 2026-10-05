import { badgeClasses, type BadgeTone } from '@/lib/ui-classes';

/*
 * A hairline and a word, never a filled pill.
 *
 * The filled pills were how red and green came to mean two unrelated things
 * on one screen: the order-detail modal showed three green READY badges above
 * an order badged UNPAID in red, and the analytics strip painted four failing
 * metrics green because the tint belonged to the card rather than the value.
 * A bordered badge cannot shout, so colour goes back to meaning status.
 */

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={badgeClasses(tone, className)} {...props} />;
}
