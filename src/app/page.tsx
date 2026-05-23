import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-cream text-ink">
      <section className="mx-auto grid min-h-screen max-w-6xl place-items-center px-6 py-16">
        <div className="grid gap-8 md:grid-cols-[1.1fr_.9fr] md:items-center">
          <div>
            <p className="mb-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-gold shadow-soft">
              Cloud View — Smart Hospitality, One Tap Away
            </p>
            <h1 className="text-5xl font-black tracking-tight md:text-7xl">
              Tap NFC. Order. Request. Relax.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-neutral-700">
              A production-ready MVP starter for hotels, resorts, villas, and staycations. Guests scan or tap an NFC panel and instantly open a mobile web portal.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild><Link href="/dashboard/login">Open Dashboard</Link></Button>
              <Button asChild variant="outline"><Link href="/t/room-305-main-panel">Demo Guest Portal</Link></Button>
            </div>
          </div>
          <Card className="gold-gradient text-white">
            <CardContent className="p-8">
              <div className="rounded-[2rem] bg-white/10 p-5 backdrop-blur">
                <p className="text-sm uppercase tracking-[0.35em] text-gold">NFC WALL PANEL</p>
                <h2 className="mt-6 text-3xl font-black">Tap to Experience</h2>
                <div className="mt-8 grid gap-3">
                  {['Order Food', 'Request Service', 'Pool Information', 'Hotel Guide'].map((item) => (
                    <div key={item} className="rounded-2xl bg-white p-4 font-bold text-ink shadow-soft">{item}</div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
