export function DashboardSuccess({
  success,
  messages
}: {
  success?: string;
  messages: Record<string, string>;
}) {
  if (!success) return null;

  const message = messages[success] || 'Action completed successfully.';

  return (
    <div className="mb-6 border border-green-200 bg-green-50 px-5 py-4 text-green-800">
      <p className="text-sm font-semibold">Success</p>
      <p className="mt-1 text-sm font-semibold">{message}</p>
    </div>
  );
}