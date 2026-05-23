import React, { type AnchorHTMLAttributes, type ButtonHTMLAttributes } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  asChild?: boolean;
  href?: string;
};

export function Button({ className, variant = 'default', size = 'md', asChild, href, children, ...props }: ButtonProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const classes = cn(
    'inline-flex items-center justify-center rounded-2xl font-bold transition disabled:cursor-not-allowed disabled:opacity-50',
    variant === 'default' && 'bg-ink text-white hover:bg-neutral-800',
    variant === 'outline' && 'border border-neutral-300 bg-white text-ink hover:bg-neutral-100',
    variant === 'ghost' && 'bg-transparent text-ink hover:bg-neutral-100',
    variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
    size === 'sm' && 'px-3 py-2 text-sm',
    size === 'md' && 'px-5 py-3',
    size === 'lg' && 'px-6 py-4 text-lg',
    className
  );

  if (asChild && React.isValidElement<{ className?: string }>(children)) {
    return React.cloneElement(children, { className: cn(classes, children.props.className) });
  }

  if (href) return <Link href={href} className={classes}>{children}</Link>;
  return <button className={classes} {...props}>{children}</button>;
}
