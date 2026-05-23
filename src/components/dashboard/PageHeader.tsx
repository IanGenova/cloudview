export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div>
        <h1 className="text-3xl font-black tracking-tight">{title}</h1>
        {description ? <p className="mt-2 text-neutral-600">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
