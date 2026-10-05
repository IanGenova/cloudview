import React, { type AnchorHTMLAttributes, type ButtonHTMLAttributes } from 'react';
import Link from 'next/link';
import { buttonClasses, type ButtonSize, type ButtonVariant } from '@/lib/ui-classes';
import { cn } from '@/lib/utils';

/*
 * The classes live in src/lib/ui-classes.ts, where they are tested: square, at
 * most 600 weight, 44px minimum, a real focus outline that is never removed,
 * and exactly one filled variant -- the ink one, not the gold one. The audit
 * found Reject and Mark Paid were the two highest-chroma controls on every
 * order card while the routine action was the quiet black one.
 *
 * The props are unchanged, so the files importing this keep compiling.
 */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  href?: string;
};

export function Button({
  className,
  variant = 'default',
  size = 'md',
  asChild,
  href,
  children,
  ...props
}: ButtonProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const classes = buttonClasses({ variant, size, className });

  if (asChild && React.isValidElement<{ className?: string }>(children)) {
    return React.cloneElement(children, {
      className: cn(classes, children.props.className),
    });
  }

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
