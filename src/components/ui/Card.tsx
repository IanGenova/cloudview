import { cardClasses } from '@/lib/ui-classes';
import { cn } from '@/lib/utils';

/*
 * A hairline, not a 2rem radius and not a 60px shadow. The audit found four
 * levels of card nesting on the dashboard home, so a card means nothing in
 * particular there: it is applied to a page region, a list, a list row and a
 * single data point alike. Making it quiet is the first step to making it
 * mean something again.
 *
 * CardTitle caps at 600 and takes the serif. It is a label far more often
 * than it is a heading, and when it is a heading the page owns the h1 above.
 */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cardClasses({ className })} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-cv-hairline p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('font-serif text-xl font-normal tracking-normal', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}
