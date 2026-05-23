import { Card, CardContent } from '@/components/ui/Card';

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm font-semibold text-neutral-500">{label}</p>
        <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
        {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
