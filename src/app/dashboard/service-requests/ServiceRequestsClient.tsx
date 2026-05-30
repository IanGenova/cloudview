'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  MessageCircle,
  ReceiptText,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { updateServiceRequestAction } from './actions';

type RequestStatusValue = string;

type StaffOption = {
  id: string;
  name: string;
};

type RequestCharge = {
  id: string;
  chargeCode: string;
  itemName: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  paymentStatus: string;
};

type RequestItem = {
  id: string;
  requestCode: string;
  hotelName: string;
  roomLabel: string;
  guestName: string;
  type: string;
  notes: string;
  status: RequestStatusValue;
  assignedToId: string;
  assignedToName: string;
  createdAt: string;
  charge: RequestCharge | null;
};

type TabValue = 'LIVE' | 'ALL' | 'BILLED' | 'NOT_BILLED' | 'HISTORY';

function money(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

function getStatusClass(status: string) {
  switch (status) {
    case 'NEW':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200';
    case 'IN_PROGRESS':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200';
    case 'COMPLETED':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200';
    case 'CANCELLED':
      return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200';
    default:
      return 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300';
  }
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-[10px] font-black ${getStatusClass(
        status
      )}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function BillingPill({ billed }: { billed: boolean }) {
  return billed ? (
    <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
      BILLED
    </span>
  ) : (
    <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
      NOT BILLED
    </span>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'green' | 'amber';
}) {
  return (
    <div
      className={
        tone === 'green'
          ? 'rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/20 dark:bg-emerald-500/10'
          : tone === 'amber'
            ? 'rounded-[2rem] border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/20 dark:bg-amber-500/10'
            : 'rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900'
      }
    >
      <div className="mb-4 grid size-11 place-items-center rounded-2xl bg-black text-white dark:bg-gold dark:text-black">
        <Icon className="size-5" />
      </div>

      <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400">
        {label}
      </p>

      <p className="mt-1 text-3xl font-black text-neutral-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function nextActionsForStatus(status: string, statuses: string[]) {
  const actions: Array<{
    label: string;
    status: string;
    tone: 'primary' | 'danger';
  }> = [];

  if (status === 'NEW' && statuses.includes('IN_PROGRESS')) {
    actions.push({
      label: 'Start Request',
      status: 'IN_PROGRESS',
      tone: 'primary',
    });
  }

  if (status === 'IN_PROGRESS' && statuses.includes('COMPLETED')) {
    actions.push({
      label: 'Mark Completed',
      status: 'COMPLETED',
      tone: 'primary',
    });
  }

  if (
    status !== 'COMPLETED' &&
    status !== 'CANCELLED' &&
    statuses.includes('CANCELLED')
  ) {
    actions.push({
      label: 'Cancel',
      status: 'CANCELLED',
      tone: 'danger',
    });
  }

  return actions;
}

function QuickStatusAction({
  request,
  status,
  label,
  tone,
}: {
  request: RequestItem;
  status: string;
  label: string;
  tone: 'primary' | 'danger';
}) {
  return (
    <form action={updateServiceRequestAction}>
      <input type="hidden" name="requestId" value={request.id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="assignedToId" value={request.assignedToId} />

      {request.charge ? (
        <>
          <input type="hidden" name="postCharge" value="true" />
          <input
            type="hidden"
            name="chargeItemName"
            value={request.charge.itemName}
          />
          <input
            type="hidden"
            name="chargeQuantity"
            value={request.charge.quantity}
          />
          <input
            type="hidden"
            name="chargeUnitPrice"
            value={request.charge.unitPrice}
          />
          <input
            type="hidden"
            name="chargeDescription"
            value={request.charge.description}
          />
        </>
      ) : null}

      <button
        type="submit"
        className={
          tone === 'danger'
            ? 'h-10 w-full rounded-2xl bg-red-600 px-4 text-sm font-black text-white transition hover:bg-red-700'
            : 'h-10 w-full rounded-2xl bg-black px-4 text-sm font-black text-white transition hover:bg-neutral-800 dark:bg-gold dark:text-black dark:hover:bg-gold/80'
        }
      >
        {label}
      </button>
    </form>
  );
}

function RequestCard({
  request,
  statuses,
  onOpen,
}: {
  request: RequestItem;
  statuses: string[];
  onOpen: () => void;
}) {
  const actions = nextActionsForStatus(request.status, statuses);
  const billed = Boolean(request.charge);

  return (
    <article className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-black text-neutral-950 dark:text-white">
              {request.requestCode}
            </h3>
            <StatusPill status={request.status} />
            <BillingPill billed={billed} />
          </div>

          <p className="mt-1 text-xs font-bold text-neutral-500 dark:text-neutral-400">
            {request.roomLabel} · {formatDateTime(request.createdAt)}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700"
          aria-label="Open request details"
        >
          <Eye className="size-4" />
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-2xl bg-neutral-50 p-3 dark:bg-neutral-950">
          <p className="font-black text-neutral-950 dark:text-white">
            {request.type}
          </p>

          {request.notes ? (
            <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs leading-5 text-neutral-500 dark:text-neutral-400">
              {request.notes}
            </p>
          ) : (
            <p className="mt-1 text-xs text-neutral-400">No guest note.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-neutral-50 p-3 dark:bg-neutral-950">
            <p className="text-xs font-black uppercase text-neutral-400">
              Assigned
            </p>
            <p className="mt-1 truncate text-sm font-black text-neutral-950 dark:text-white">
              {request.assignedToName || 'Unassigned'}
            </p>
          </div>

          <div className="rounded-2xl bg-neutral-50 p-3 dark:bg-neutral-950">
            <p className="text-xs font-black uppercase text-neutral-400">
              Charge
            </p>
            <p className="mt-1 text-sm font-black text-neutral-950 dark:text-white">
              {request.charge ? money(request.charge.totalAmount) : 'Free'}
            </p>
          </div>
        </div>

        {request.charge ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <p className="font-black text-emerald-700 dark:text-emerald-200">
              Room Add-on Charge
            </p>
            <p className="mt-1 text-emerald-700 dark:text-emerald-100/80">
              {request.charge.itemName} · Qty {request.charge.quantity} ·{' '}
              {money(request.charge.unitPrice)} each
            </p>
            <p className="mt-1 font-black text-emerald-800 dark:text-emerald-100">
              Total: {money(request.charge.totalAmount)}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {actions.map((action) => (
          <QuickStatusAction
            key={`${request.id}-${action.status}`}
            request={request}
            status={action.status}
            label={action.label}
            tone={action.tone}
          />
        ))}

        <button
          type="button"
          onClick={onOpen}
          className="h-10 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black text-neutral-900 transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white dark:hover:bg-neutral-800"
        >
          Open Details
        </button>
      </div>
    </article>
  );
}

function RequestLane({
  title,
  description,
  requests,
  statuses,
  onOpen,
}: {
  title: string;
  description: string;
  requests: RequestItem[];
  statuses: string[];
  onOpen: (request: RequestItem) => void;
}) {
  return (
    <section className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-neutral-950 dark:text-white">
            {title}
          </h2>
          <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400">
            {description}
          </p>
        </div>

        <span className="grid size-9 place-items-center rounded-full bg-black text-sm font-black text-white dark:bg-gold dark:text-black">
          {requests.length}
        </span>
      </div>

      <div className="space-y-3">
        {requests.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            statuses={statuses}
            onOpen={() => onOpen(request)}
          />
        ))}

        {!requests.length ? (
          <div className="rounded-[1.5rem] border border-dashed border-neutral-300 bg-white p-6 text-center text-sm font-bold text-neutral-400 dark:border-neutral-800 dark:bg-neutral-950">
            No {title.toLowerCase()} requests.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function RequestDetailsModal({
  request,
  statuses,
  staff,
  onClose,
}: {
  request: RequestItem;
  statuses: string[];
  staff: StaffOption[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl dark:bg-neutral-950">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-black text-neutral-950 dark:text-white">
                {request.requestCode}
              </h2>
              <StatusPill status={request.status} />
              <BillingPill billed={Boolean(request.charge)} />
            </div>

            <p className="mt-1 text-sm font-bold text-neutral-500 dark:text-neutral-400">
              {request.hotelName} · {request.roomLabel} ·{' '}
              {formatDateTime(request.createdAt)}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <main className="space-y-4">
            <section className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <h3 className="mb-3 flex items-center gap-2 font-black text-neutral-950 dark:text-white">
                <MessageCircle className="size-5 text-gold" />
                Request Details
              </h3>

              <div className="space-y-3 text-sm">
                <div className="rounded-2xl bg-white p-3 dark:bg-neutral-950">
                  <p className="text-xs font-black uppercase text-neutral-400">
                    Request Type
                  </p>
                  <p className="mt-1 font-black text-neutral-950 dark:text-white">
                    {request.type}
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-3 dark:bg-neutral-950">
                  <p className="text-xs font-black uppercase text-neutral-400">
                    Guest Name
                  </p>
                  <p className="mt-1 font-black text-neutral-950 dark:text-white">
                    {request.guestName || 'Guest name not provided'}
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-3 dark:bg-neutral-950">
                  <p className="text-xs font-black uppercase text-neutral-400">
                    Guest Note
                  </p>
                  <p className="mt-1 whitespace-pre-line leading-6 text-neutral-600 dark:text-neutral-400">
                    {request.notes || 'No note provided.'}
                  </p>
                </div>
              </div>
            </section>
          </main>

          <aside>
            <form
              action={updateServiceRequestAction}
              className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <input type="hidden" name="requestId" value={request.id} />

              <h3 className="mb-4 flex items-center gap-2 font-black text-neutral-950 dark:text-white">
                <UserRound className="size-5 text-gold" />
                Staff & Billing
              </h3>

              <div className="grid gap-3">
                <div>
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500 dark:text-neutral-400">
                    Request Status
                  </label>
                  <Select name="status" defaultValue={request.status}>
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500 dark:text-neutral-400">
                    Assigned Staff
                  </label>
                  <Select
                    name="assignedToId"
                    defaultValue={request.assignedToId}
                  >
                    <option value="">Unassigned</option>
                    {staff.map((staffMember) => (
                      <option key={staffMember.id} value={staffMember.id}>
                        {staffMember.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500 dark:text-neutral-400">
                    Staff Note
                  </label>
                  <input
                    name="note"
                    placeholder="Optional internal update note"
                    className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                  />
                </div>

                <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
                  <label className="flex items-center gap-2 text-sm font-black text-neutral-950 dark:text-white">
                    <input
                      type="checkbox"
                      name="postCharge"
                      value="true"
                      defaultChecked={Boolean(request.charge)}
                      className="size-4"
                    />
                    Mark as billable room add-on
                  </label>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500 dark:text-neutral-400">
                    Add-on Item
                  </label>
                  <input
                    name="chargeItemName"
                    defaultValue={request.charge?.itemName ?? request.type}
                    className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-black uppercase text-neutral-500 dark:text-neutral-400">
                      Qty
                    </label>
                    <input
                      name="chargeQuantity"
                      type="number"
                      min="1"
                      step="1"
                      defaultValue={request.charge?.quantity ?? 1}
                      className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-black uppercase text-neutral-500 dark:text-neutral-400">
                      Unit Price
                    </label>
                    <input
                      name="chargeUnitPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={request.charge?.unitPrice ?? ''}
                      className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500 dark:text-neutral-400">
                    Billing Note
                  </label>
                  <input
                    name="chargeDescription"
                    defaultValue={request.charge?.description ?? request.notes}
                    className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                  />
                </div>

                <Button className="w-full">Save Request</Button>
              </div>
            </form>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function ServiceRequestsClient({
  summary,
  requests,
  statuses,
  staff,
}: {
  summary: {
    totalRequests: number;
    liveRequests: number;
    billedRequests: number;
    notBilledRequests: number;
    totalBilledAmount: number;
  };
  requests: RequestItem[];
  statuses: string[];
  staff: StaffOption[];
}) {
  const [activeTab, setActiveTab] = useState<TabValue>('LIVE');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(
    null
  );

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();

    return requests.filter((request) => {
      const billed = Boolean(request.charge);

      const matchesTab =
        activeTab === 'ALL' ||
        (activeTab === 'LIVE' &&
          (request.status === 'NEW' || request.status === 'IN_PROGRESS')) ||
        (activeTab === 'BILLED' && billed) ||
        (activeTab === 'NOT_BILLED' && !billed) ||
        (activeTab === 'HISTORY' &&
          (request.status === 'COMPLETED' ||
            request.status === 'CANCELLED'));

      const matchesStatus =
        statusFilter === 'ALL' || request.status === statusFilter;

      const matchesSearch =
        !query ||
        [
          request.requestCode,
          request.hotelName,
          request.roomLabel,
          request.guestName,
          request.type,
          request.notes,
          request.assignedToName,
          request.charge?.itemName ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);

      return matchesTab && matchesStatus && matchesSearch;
    });
  }, [activeTab, requests, search, statusFilter]);

  const newRequests = requests.filter((request) => request.status === 'NEW');
  const inProgressRequests = requests.filter(
    (request) => request.status === 'IN_PROGRESS'
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Total Requests"
          value={summary.totalRequests}
          icon={MessageCircle}
        />

        <SummaryCard
          label="Live Requests"
          value={summary.liveRequests}
          icon={Clock}
          tone="amber"
        />

        <SummaryCard
          label="Billed"
          value={summary.billedRequests}
          icon={CreditCard}
          tone="green"
        />

        <SummaryCard
          label="Not Billed"
          value={summary.notBilledRequests}
          icon={ReceiptText}
          tone="amber"
        />

        <SummaryCard
          label="Add-on Revenue"
          value={money(summary.totalBilledAmount)}
          icon={CheckCircle2}
          tone="green"
        />
      </div>

      <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-neutral-950 dark:text-white">
              Service Operations Center
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Compact cards for live work. Open the modal for assignment,
              billing, and details.
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-3 md:flex-row">
            <label className="relative min-w-0 md:w-[360px]">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search request, room, guest, add-on..."
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white pl-11 pr-4 text-sm font-bold text-neutral-900 outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
              />
            </label>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
            >
              <option value="ALL">All Statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {[
            { value: 'LIVE', label: 'Live Requests', icon: Clock },
            { value: 'ALL', label: 'All Requests', icon: MessageCircle },
            { value: 'BILLED', label: 'Billed', icon: CreditCard },
            { value: 'NOT_BILLED', label: 'Not Billed', icon: ReceiptText },
            { value: 'HISTORY', label: 'History', icon: CheckCircle2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.value;

            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value as TabValue)}
                className={
                  active
                    ? 'inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-black px-5 text-sm font-black text-white dark:bg-gold dark:text-black'
                    : 'inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-5 text-sm font-black text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white dark:hover:bg-neutral-800'
                }
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {activeTab === 'LIVE' && statusFilter === 'ALL' && !search.trim() ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <RequestLane
            title="New"
            description="Guest requests waiting for staff action."
            requests={newRequests}
            statuses={statuses}
            onOpen={setSelectedRequest}
          />

          <RequestLane
            title="In Progress"
            description="Requests currently being handled."
            requests={inProgressRequests}
            statuses={statuses}
            onOpen={setSelectedRequest}
          />
        </div>
      ) : (
        <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-4">
            <h2 className="text-xl font-black text-neutral-950 dark:text-white">
              Filtered Requests
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Showing {filteredRequests.length} request
              {filteredRequests.length === 1 ? '' : 's'}.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {filteredRequests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                statuses={statuses}
                onOpen={() => setSelectedRequest(request)}
              />
            ))}

            {!filteredRequests.length ? (
              <div className="rounded-[1.5rem] border border-dashed border-neutral-300 p-8 text-center text-sm font-bold text-neutral-400 dark:border-neutral-800 xl:col-span-2 2xl:col-span-3">
                No service requests match your current filters.
              </div>
            ) : null}
          </div>
        </section>
      )}

      {selectedRequest ? (
        <RequestDetailsModal
          request={selectedRequest}
          statuses={statuses}
          staff={staff}
          onClose={() => setSelectedRequest(null)}
        />
      ) : null}
    </div>
  );
}