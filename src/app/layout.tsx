import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';

export const metadata: Metadata = {
  title: 'Cloud View — Smart Hospitality, One Tap Away',
  description:
    'NFC guest portal, hotel ordering, inventory, service requests, and POS-ready dashboard.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="bg-neutral-100 text-neutral-900 transition-colors duration-300 dark:bg-neutral-950 dark:text-white"
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}