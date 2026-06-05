export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3">
        <div className="h-8 w-40 animate-pulse rounded-xl bg-neutral-200" />
        <div className="h-4 w-72 animate-pulse rounded-xl bg-neutral-200" />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm"
          >
            <div className="h-4 w-24 animate-pulse rounded-xl bg-neutral-200" />
            <div className="mt-4 h-8 w-20 animate-pulse rounded-xl bg-neutral-300" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 p-5">
            <div className="h-6 w-36 animate-pulse rounded-xl bg-neutral-200" />
          </div>

          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-2xl bg-neutral-50 p-4"
              >
                <div className="space-y-2">
                  <div className="h-5 w-28 animate-pulse rounded-xl bg-neutral-200" />
                  <div className="h-4 w-44 animate-pulse rounded-xl bg-neutral-200" />
                </div>

                <div className="space-y-2">
                  <div className="h-6 w-20 animate-pulse rounded-xl bg-neutral-200" />
                  <div className="h-4 w-16 animate-pulse rounded-xl bg-neutral-200" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 p-5">
            <div className="h-6 w-56 animate-pulse rounded-xl bg-neutral-200" />
          </div>

          <div className="grid gap-5 p-5 md:grid-cols-2">
            <div className="space-y-3">
              <div className="h-5 w-36 animate-pulse rounded-xl bg-neutral-200" />

              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="h-12 animate-pulse rounded-2xl bg-neutral-100"
                />
              ))}
            </div>

            <div className="space-y-3">
              <div className="h-5 w-32 animate-pulse rounded-xl bg-neutral-200" />

              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="h-12 animate-pulse rounded-2xl bg-neutral-100"
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center py-4">
        <div className="flex items-center gap-3 rounded-full border border-neutral-200 bg-white px-5 py-3 shadow-sm">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-gold" />
          <p className="text-sm font-bold text-neutral-500">
            Loading dashboard data...
          </p>
        </div>
      </div>
    </div>
  );
}