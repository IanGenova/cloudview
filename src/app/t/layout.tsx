import type { ReactNode } from 'react';

type GuestRootLayoutProps = {
  children: ReactNode;
};

export default function GuestRootLayout({ children }: GuestRootLayoutProps) {
  return <>{children}</>;
}