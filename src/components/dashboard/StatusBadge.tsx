import { Badge } from '@/components/ui/Badge';

export function StatusBadge({ status }: { status: string }) {
  const tone = status.includes('CANCEL') || status.includes('FAILED') ? 'red' : status.includes('READY') || status.includes('COMPLETED') || status.includes('SENT') || status.includes('PAID') ? 'green' : status.includes('PREPARING') || status.includes('IN_PROGRESS') ? 'blue' : 'gold';
  return <Badge tone={tone as any}>{status.replaceAll('_', ' ')}</Badge>;
}
