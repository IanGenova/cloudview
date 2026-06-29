'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const entranceEase = [0.22, 1, 0.36, 1] as const;

export function GuestReveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{
        duration: 0.72,
        delay,
        ease: entranceEase,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function GuestPressable({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.012 }}
      whileTap={{ scale: 0.982 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function GuestAnimatedBackground() {
  const reduceMotion = useReducedMotion();

  return (
    <>
      <motion.div
        aria-hidden="true"
        animate={
          reduceMotion
            ? undefined
            : {
                x: [0, 18, -10, 0],
                y: [0, -18, 8, 0],
                opacity: [0.16, 0.28, 0.2, 0.16],
              }
        }
        transition={{
          duration: 9,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute right-[-5rem] top-10 h-52 w-52 rounded-full bg-gold/35 blur-3xl"
      />

      <motion.div
        aria-hidden="true"
        animate={
          reduceMotion
            ? undefined
            : {
                x: [0, -16, 10, 0],
                y: [0, 16, -10, 0],
                opacity: [0.12, 0.22, 0.15, 0.12],
              }
        }
        transition={{
          duration: 11,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute left-[-6rem] top-36 h-64 w-64 rounded-full bg-white/25 blur-3xl"
      />

      <motion.div
        aria-hidden="true"
        animate={
          reduceMotion
            ? undefined
            : {
                scale: [1, 1.08, 1],
                opacity: [0.18, 0.38, 0.18],
              }
        }
        transition={{
          duration: 4.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute left-1/2 top-10 h-28 w-28 -translate-x-1/2 rounded-full border border-gold/30"
      />
    </>
  );
}

export function GuestShimmer() {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return null;
  }

  return (
    <motion.div
      aria-hidden="true"
      animate={{ x: ['-160%', '180%'] }}
      transition={{
        duration: 5.5,
        repeat: Infinity,
        repeatDelay: 1.8,
        ease: 'easeInOut',
      }}
      className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-24 rotate-12 bg-gradient-to-r from-transparent via-white/12 to-transparent blur-md"
    />
  );
}
