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
    <div className="mb-6 rounded-[1.5rem] border border-green-200 bg-green-50 px-5 py-4 text-green-800 shadow-soft">
      <p className="text-sm font-black">Success</p>
      <p className="mt-1 text-sm font-semibold">{message}</p>
    </div>
  );
}