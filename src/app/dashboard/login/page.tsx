import { redirect } from 'next/navigation';
import { LoginForm } from './LoginForm';
import { Card, CardContent } from '@/components/ui/Card';
import { dashboardHomeForRole, getCurrentUser } from '@/lib/auth';

export default async function LoginPage() {
  const user = await getCurrentUser();

  // If already logged in and user presses browser Back to /dashboard/login,
  // redirect back to dashboard instead of showing login inside the dashboard shell.
  if (user) redirect(dashboardHomeForRole(user.role));

  return (
    <main className="grid min-h-screen place-items-center bg-cream px-5 py-10">
      <Card className="w-full max-w-md overflow-hidden">
        <div className="gold-gradient p-8 text-white">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-gold">
            Cloud View
          </p>
          <h1 className="mt-4 text-3xl font-black">Hotel Staff Dashboard</h1>
          <p className="mt-2 text-sm text-white/70">
            Manage orders, services, inventory, NFC tags, and POS sync.
          </p>
        </div>

        <CardContent className="p-8">
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}