'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  Ban,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  MessageCircle,
  ReceiptText,
  Search,
  X,
} from 'lucide-react';
import { Select } from '@/components/ui/Select';
import {
  cancelServiceRequestItemAction,
  updateServiceRequestAction,
} from './actions';

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

type RequestStatusHistory = {
  id: string;
  status: string;
  note: string;
  createdAt: string;
  userName: string;
};

type ServiceRequestOrderItem = {
  id: string;
  requestCode: string;
  type: string;
  notes: string;
  status: RequestStatusValue;
  assignedToId: string;
  assignedToName: string;
  createdAt: string;
  charge: RequestCharge | null;
  statusHistory: RequestStatusHistory[];
};

type RequestGroup = {
  id: string;
  requestCode: string;
  hotelId: string;
  hotelName: string;
  roomLabel: string;
  guestName: string;
  status: RequestStatusValue;
  assignedToId: string;
  assignedToName: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  billedCount: number;
  totalChargeAmount: number;
  items: ServiceRequestOrderItem[];
};

type TabValue = 'LIVE' | 'ALL' | 'BILLED' | 'NOT_BILLED' | 'HISTORY';

type ToastMessage =
  | {
      type: 'success' | 'error';
      text: string;
    }
  | null;

const operationTabs: {
  value: TabValue;
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  {
    value: 'LIVE',
    label: 'Live Requests',
    icon: Clock,
  },
  {
    value: 'ALL',
    label: 'All Requests',
    icon: MessageCircle,
  },
  {
    value: 'BILLED',
    label: 'Billed',
    icon: CreditCard,
  },
  {
    value: 'NOT_BILLED',
    label: 'Not Billed',
    icon: ReceiptText,
  },
  {
    value: 'HISTORY',
    label: 'History',
    icon: CheckCircle2,
  },
];

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

function BillingPill({
  billedCount,
  itemCount,
}: {
  billedCount: number;
  itemCount: number;
}) {
  if (billedCount <= 0) {
    return (
      <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
        NOT BILLED
      </span>
    );
  }

  if (billedCount < itemCount) {
    return (
      <span className="rounded-full bg-blue-100 px-3 py-1 text-[10px] font-black text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
        PARTIAL BILL
      </span>
    );
  }

  return (
    <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
      BILLED
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
  icon: ComponentType<{ className?: string }>;
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
      label: 'Start Request Order',
      status: 'IN_PROGRESS',
      tone: 'primary',
    });
  }

  if (status === 'IN_PROGRESS' && statuses.includes('COMPLETED')) {
    actions.push({
      label: 'Mark All Completed',
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
      label: 'Cancel Request Order',
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
  request: RequestGroup;
  status: string;
  label: string;
  tone: 'primary' | 'danger';
}) {
  return (
    <form action={updateServiceRequestAction}>
      <input type="hidden" name="hotelId" value={request.hotelId} />
      <input type="hidden" name="requestCode" value={request.requestCode} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="assignedToId" value={request.assignedToId} />
      <input
        type="hidden"
        name="note"
        value={`Grouped request order updated to ${statusLabel(status)}`}
      />

      <button
        type="submit"
        className={
          tone === 'danger'
            ? 'h-10 w-full rounded-2xl bg-red-600 px-4 text-sm font-black text-white transition hover:bg-red-700'
            : 'h-10 w-full rounded-2xl bg-black px-4 text-sm font-black text-white transition hover:bg-neutral-800 dark:bg-gold dark:text-black dark:hover:bg-gold/90'
        }
      >
        {label}
      </button>
    </form>
  );
}

function extractQuantityFromNotes(notes: string) {
  const match = notes.match(/Quantity:\s*(\d+)/i);

  if (!match) {
    return 1;
  }

  const quantity = Number(match[1]);

  return Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
}

function RequestItemCard({
  item,
  onCancel,
}: {
  item: ServiceRequestOrderItem;
  onCancel: (item: ServiceRequestOrderItem) => void;
}) {
  const canCancelItem = item.status === 'NEW';

  return (
    <div className="rounded-2xl bg-neutral-50 p-4 dark:bg-neutral-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-neutral-950 dark:text-white">
              {item.type}
            </p>
            <StatusPill status={item.status} />
          </div>

          {item.notes ? (
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-neutral-500 dark:text-neutral-400">
              {item.notes}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {item.charge ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
              {money(item.charge.totalAmount)}
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
              NOT BILLED
            </span>
          )}

          {canCancelItem ? (
            <button
              type="button"
              onClick={() => onCancel(item)}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-red-600 px-3 text-[10px] font-black text-white transition hover:bg-red-700"
            >
              <Ban className="size-3" />
              Cancel Item
            </button>
          ) : null}
        </div>
      </div>

      {item.charge ? (
        <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
          <p>{item.charge.itemName}</p>
          <p>
            {item.charge.quantity} × {money(item.charge.unitPrice)} ={' '}
            {money(item.charge.totalAmount)}
          </p>
        </div>
      ) : null}

      {!canCancelItem && item.status !== 'CANCELLED' ? (
        <p className="mt-3 rounded-xl bg-neutral-100 p-3 text-xs font-bold text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
          This service item can no longer be cancelled directly because it has
          already been started or completed.
        </p>
      ) : null}
    </div>
  );
}

function CancelServiceItemModal({
  item,
  requestCode,
  onClose,
}: {
  item: ServiceRequestOrderItem;
  requestCode: string;
  onClose: () => void;
}) {
  const cancelReasons = [
    'Guest cancelled this item',
    'Item unavailable',
    'Duplicate service item',
    'Wrong service selected',
    'Staff cannot fulfill this item',
    'Other',
  ];

  const [reason, setReason] = useState(cancelReasons[0]);
  const [customReason, setCustomReason] = useState('');

  const finalReason =
    reason === 'Other' ? customReason.trim() || 'Other' : reason;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl dark:bg-neutral-900">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-neutral-950 dark:text-white">
              Cancel Service Item
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Cancel <b>{item.type}</b> from request order{' '}
              <b>{requestCode}</b>.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-white"
            aria-label="Close cancel item modal"
          >
            <X className="size-4" />
          </button>
        </div>

        <form action={cancelServiceRequestItemAction} className="space-y-4">
          <input type="hidden" name="requestId" value={item.id} />
          <input type="hidden" name="reason" value={finalReason} />

          <label className="grid gap-2">
            <span className="text-sm font-black text-neutral-800 dark:text-neutral-200">
              Cancellation Reason
            </span>
            <Select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            >
              {cancelReasons.map((itemReason) => (
                <option key={itemReason} value={itemReason}>
                  {itemReason}
                </option>
              ))}
            </Select>
          </label>

          {reason === 'Other' ? (
            <label className="grid gap-2">
              <span className="text-sm font-black text-neutral-800 dark:text-neutral-200">
                Custom Reason
              </span>
              <textarea
                value={customReason}
                onChange={(event) => setCustomReason(event.target.value)}
                placeholder="Type reason..."
                className="min-h-24 resize-none rounded-2xl border border-neutral-200 bg-white p-4 text-sm font-semibold outline-none dark:border-neutral-800 dark:bg-neutral-950"
              />
            </label>
          ) : null}

          <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 dark:bg-red-500/10 dark:text-red-200">
            This will cancel only this service item. Other service items under
            the same request order will remain active.
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-2xl border border-neutral-200 bg-white text-sm font-black text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
            >
              Close
            </button>

            <button
              type="submit"
              className="h-11 rounded-2xl bg-red-600 text-sm font-black text-white hover:bg-red-700"
            >
              Confirm Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DetailsModal({
  request,
  statuses,
  staff,
  onClose,
}: {
  request: RequestGroup;
  statuses: string[];
  staff: StaffOption[];
  onClose: () => void;
}) {
  const [selectedStatus, setSelectedStatus] = useState(request.status);
  const [selectedStaffId, setSelectedStaffId] = useState(request.assignedToId);
  const [postCharge, setPostCharge] = useState(false);
  const [cancelItem, setCancelItem] = useState<ServiceRequestOrderItem | null>(
    null
  );

  const chargeableItems = request.items.filter(
    (item) => item.status !== 'CANCELLED'
  );

  return (
    <>
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
        <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl dark:bg-neutral-900">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-black text-neutral-950 dark:text-white">
                  {request.requestCode}
                </h2>
                <StatusPill status={request.status} />
                <BillingPill
                  billedCount={request.billedCount}
                  itemCount={request.itemCount}
                />
              </div>

              <p className="mt-1 text-sm text-neutral-500">
                {request.hotelName} · {request.roomLabel} · {request.itemCount}{' '}
                service item{request.itemCount === 1 ? '' : 's'}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-white"
              aria-label="Close details"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-3">
              <h3 className="font-black text-neutral-950 dark:text-white">
                Service Items
              </h3>

              {request.items.map((item) => (
                <RequestItemCard
                  key={item.id}
                  item={item}
                  onCancel={setCancelItem}
                />
              ))}
            </div>

            <aside className="space-y-4">
              <div className="rounded-2xl bg-neutral-50 p-4 dark:bg-neutral-950">
                <p className="text-sm font-black text-neutral-950 dark:text-white">
                  Request Order Details
                </p>

                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-neutral-500">Guest</span>
                    <b>{request.guestName || 'Not provided'}</b>
                  </div>

                  <div className="flex justify-between gap-3">
                    <span className="text-neutral-500">Assigned</span>
                    <b>{request.assignedToName || 'Unassigned'}</b>
                  </div>

                  <div className="flex justify-between gap-3">
                    <span className="text-neutral-500">Created</span>
                    <b>{formatDateTime(request.createdAt)}</b>
                  </div>

                  <div className="flex justify-between gap-3">
                    <span className="text-neutral-500">Total Charge</span>
                    <b>{money(request.totalChargeAmount)}</b>
                  </div>
                </div>
              </div>

              <form
                action={updateServiceRequestAction}
                className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800"
              >
                <input
                  type="hidden"
                  name="requestCode"
                  value={request.requestCode}
                />

                <div className="grid gap-3">
                  <label className="grid gap-1">
                    <span className="text-xs font-black uppercase text-neutral-500">
                      Status
                    </span>
                    <Select
                      name="status"
                      value={selectedStatus}
                      onChange={(event) =>
                        setSelectedStatus(event.target.value)
                      }
                    >
                      {statuses.map((status) => (
                        <option key={status} value={status}>
                          {statusLabel(status)}
                        </option>
                      ))}
                    </Select>
                  </label>

                  <label className="grid gap-1">
                    <span className="text-xs font-black uppercase text-neutral-500">
                      Assign Staff
                    </span>
                    <Select
                      name="assignedToId"
                      value={selectedStaffId}
                      onChange={(event) =>
                        setSelectedStaffId(event.target.value)
                      }
                    >
                      <option value="">Unassigned</option>
                      {staff.map((staffMember) => (
                        <option key={staffMember.id} value={staffMember.id}>
                          {staffMember.name}
                        </option>
                      ))}
                    </Select>
                  </label>

                  <label className="grid gap-1">
                    <span className="text-xs font-black uppercase text-neutral-500">
                      Internal Note
                    </span>
                    <textarea
                      name="note"
                      placeholder="Optional note for this grouped request order"
                      className="min-h-24 resize-none rounded-2xl border border-neutral-200 bg-white p-3 text-sm font-semibold outline-none dark:border-neutral-800 dark:bg-neutral-950"
                    />
                  </label>

                  <label className="flex items-start gap-3 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                    <input
                      type="checkbox"
                      name="postCharge"
                      value="true"
                      checked={postCharge}
                      onChange={(event) => setPostCharge(event.target.checked)}
                      className="mt-1 size-4"
                    />
                    Post or update room add-on charges for selected items.
                  </label>

                  {postCharge ? (
                    <div className="space-y-3">
                      {chargeableItems.map((item) => {
                        const quantity =
                          item.charge?.quantity ??
                          extractQuantityFromNotes(item.notes);
                        const unitPrice = item.charge?.unitPrice ?? 0;

                        return (
                          <div
                            key={item.id}
                            className="rounded-2xl bg-neutral-50 p-3 dark:bg-neutral-950"
                          >
                            <input
                              type="hidden"
                              name="chargeRequestId"
                              value={item.id}
                            />

                            <p className="mb-2 text-sm font-black">
                              {item.type}
                            </p>

                            <div className="grid gap-2 md:grid-cols-3">
                              <input
                                name={`chargeItemName_${item.id}`}
                                defaultValue={
                                  item.charge?.itemName ?? item.type
                                }
                                placeholder="Item name"
                                className="h-11 rounded-2xl border border-neutral-200 px-3 text-sm font-semibold outline-none dark:border-neutral-800 dark:bg-neutral-900"
                              />

                              <input
                                name={`chargeQuantity_${item.id}`}
                                type="number"
                                min="1"
                                defaultValue={quantity}
                                placeholder="Qty"
                                className="h-11 rounded-2xl border border-neutral-200 px-3 text-sm font-semibold outline-none dark:border-neutral-800 dark:bg-neutral-900"
                              />

                              <input
                                name={`chargeUnitPrice_${item.id}`}
                                type="number"
                                min="0.01"
                                step="0.01"
                                defaultValue={unitPrice || ''}
                                placeholder="Unit price"
                                className="h-11 rounded-2xl border border-neutral-200 px-3 text-sm font-semibold outline-none dark:border-neutral-800 dark:bg-neutral-900"
                              />
                            </div>

                            <input
                              name={`chargeDescription_${item.id}`}
                              defaultValue={
                                item.charge?.description ?? item.notes
                              }
                              placeholder="Description"
                              className="mt-2 h-11 w-full rounded-2xl border border-neutral-200 px-3 text-sm font-semibold outline-none dark:border-neutral-800 dark:bg-neutral-900"
                            />
                          </div>
                        );
                      })}

                      {!chargeableItems.length ? (
                        <div className="rounded-2xl bg-neutral-50 p-4 text-sm font-bold text-neutral-500 dark:bg-neutral-950">
                          No active service items can be charged because all
                          items are cancelled.
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    className="h-11 rounded-2xl bg-black text-sm font-black text-white hover:bg-neutral-800 dark:bg-gold dark:text-black dark:hover:bg-gold/90"
                  >
                    Save Request Order
                  </button>
                </div>
              </form>
            </aside>
          </div>
        </div>
      </div>

      {cancelItem ? (
        <CancelServiceItemModal
          item={cancelItem}
          requestCode={request.requestCode}
          onClose={() => setCancelItem(null)}
        />
      ) : null}
    </>
  );
}

function Toast({
  message,
}: {
  message?: ToastMessage;
}) {
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }

    setVisible(true);

    const timeout = window.setTimeout(() => {
      setVisible(false);
    }, 4500);

    return () => window.clearTimeout(timeout);
  }, [message?.text, message?.type]);

  if (!message || !visible) {
    return null;
  }

  return (
    <div className="fixed right-5 top-5 z-[90] w-[calc(100vw-2.5rem)] max-w-md">
      <div
        className={
          message.type === 'success'
            ? 'flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 shadow-2xl'
            : 'flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-2xl'
        }
      >
        <div
          className={
            message.type === 'success'
              ? 'grid size-9 shrink-0 place-items-center rounded-full bg-emerald-600 text-white'
              : 'grid size-9 shrink-0 place-items-center rounded-full bg-red-600 text-white'
          }
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="size-5" />
          ) : (
            <X className="size-5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">
            {message.type === 'success' ? 'Success' : 'Action failed'}
          </p>
          <p className="mt-1 text-sm font-bold leading-6">{message.text}</p>
        </div>

        <button
          type="button"
          onClick={() => setVisible(false)}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70 hover:bg-white"
          aria-label="Close notification"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function ServiceRequestsClient({
  message,
  statuses,
  staff,
  summary,
  requests,
}: {
  message?: ToastMessage;
  statuses: string[];
  staff: StaffOption[];
  summary: {
    totalRequests: number;
    liveRequests: number;
    billedRequests: number;
    notBilledRequests: number;
    totalBilledAmount: number;
  };
  requests: RequestGroup[];
}) {
  const [activeTab, setActiveTab] = useState<TabValue>('LIVE');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedRequest, setSelectedRequest] = useState<RequestGroup | null>(
    null
  );

  const filteredRequests = useMemo(() => {
    const search = query.trim().toLowerCase();

    return requests.filter((request) => {
      const live =
        request.status === 'NEW' || request.status === 'IN_PROGRESS';
      const billed = request.billedCount > 0;
      const history =
        request.status === 'COMPLETED' || request.status === 'CANCELLED';

      const matchesTab =
        activeTab === 'ALL' ||
        (activeTab === 'LIVE' && live) ||
        (activeTab === 'BILLED' && billed) ||
        (activeTab === 'NOT_BILLED' && !billed) ||
        (activeTab === 'HISTORY' && history);

      const matchesStatus =
        statusFilter === 'ALL' || request.status === statusFilter;

      const itemText = request.items
        .map((item) => `${item.type} ${item.notes}`)
        .join(' ');

      const matchesSearch =
        !search ||
        `${request.requestCode} ${request.roomLabel} ${request.guestName} ${request.hotelName} ${itemText}`
          .toLowerCase()
          .includes(search);

      return matchesTab && matchesStatus && matchesSearch;
    });
  }, [activeTab, query, requests, statusFilter]);

  const newRequests = filteredRequests.filter(
    (request) => request.status === 'NEW'
  );

  const inProgressRequests = filteredRequests.filter(
    (request) => request.status === 'IN_PROGRESS'
  );

  const otherRequests = filteredRequests.filter(
    (request) =>
      request.status !== 'NEW' && request.status !== 'IN_PROGRESS'
  );

  return (
    <>
     <Toast message={message} />
      <div className="mb-6 grid gap-3 md:grid-cols-5">
        <SummaryCard
          label="Total Request Orders"
          value={summary.totalRequests}
          icon={MessageCircle}
        />
        <SummaryCard
          label="Live Request Orders"
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

      <div className="mb-6 rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-neutral-950 dark:text-white">
              Service Operations Center
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Grouped by request order ID. One request card can contain multiple
              service items.
            </p>
          </div>

          <div className="grid gap-2 md:grid-cols-[1fr_180px] xl:min-w-[520px]">
            <div className="flex h-11 items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 dark:border-neutral-800 dark:bg-neutral-950">
              <Search className="size-4 text-neutral-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search request order, room, guest, add-on..."
                className="w-full bg-transparent text-sm font-semibold outline-none"
              />
            </div>

            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="ALL">All Statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {operationTabs.map((tab) => {
            const Icon = tab.icon;

            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={
                  activeTab === tab.value
                    ? 'inline-flex h-11 items-center gap-2 rounded-2xl bg-black px-5 text-sm font-black text-white dark:bg-gold dark:text-black'
                    : 'inline-flex h-11 items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-5 text-sm font-black text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300'
                }
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'LIVE' || activeTab === 'ALL' ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <RequestLane
            title="New"
            description="Grouped service request orders waiting for staff action."
            requests={newRequests}
            statuses={statuses}
            onOpen={setSelectedRequest}
          />

          <RequestLane
            title="In Progress"
            description="Grouped request orders currently being handled."
            requests={inProgressRequests}
            statuses={statuses}
            onOpen={setSelectedRequest}
          />
        </div>
      ) : (
        <RequestLane
          title={
            activeTab === 'BILLED'
              ? 'Billed Request Orders'
              : activeTab === 'NOT_BILLED'
                ? 'Not Billed Request Orders'
                : 'Request History'
          }
          description="Grouped service request orders."
          requests={filteredRequests}
          statuses={statuses}
          onOpen={setSelectedRequest}
          wide
        />
      )}

      {activeTab === 'ALL' && otherRequests.length > 0 ? (
        <div className="mt-5">
          <RequestLane
            title="Completed / Cancelled"
            description="Request order history."
            requests={otherRequests}
            statuses={statuses}
            onOpen={setSelectedRequest}
            wide
          />
        </div>
      ) : null}

      {selectedRequest ? (
        <DetailsModal
          request={selectedRequest}
          statuses={statuses}
          staff={staff}
          onClose={() => setSelectedRequest(null)}
        />
      ) : null}
    </>
  );
}

function RequestLane({
  title,
  description,
  requests,
  statuses,
  onOpen,
  wide,
}: {
  title: string;
  description: string;
  requests: RequestGroup[];
  statuses: string[];
  onOpen: (request: RequestGroup) => void;
  wide?: boolean;
}) {
  return (
    <section className="rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-neutral-950 dark:text-white">
            {title}
          </h3>
          <p className="text-xs text-neutral-500">{description}</p>
        </div>

        <span className="grid size-9 place-items-center rounded-full bg-black text-sm font-black text-white dark:bg-gold dark:text-black">
          {requests.length}
        </span>
      </div>

      <div
        className={
          wide
            ? 'grid gap-3 md:grid-cols-2 2xl:grid-cols-3'
            : 'space-y-3'
        }
      >
        {requests.map((request) => {
          const actions = nextActionsForStatus(request.status, statuses);
          const itemPreview = request.items
            .slice(0, 3)
            .map((item) => item.type)
            .join(', ');

          return (
            <article
              key={request.id}
              className="rounded-[1.5rem] border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-black text-neutral-950 dark:text-white">
                      {request.requestCode}
                    </h4>
                    <StatusPill status={request.status} />
                    <BillingPill
                      billedCount={request.billedCount}
                      itemCount={request.itemCount}
                    />
                  </div>

                  <p className="mt-1 text-xs font-bold text-neutral-500">
                    {request.roomLabel} · {formatDateTime(request.createdAt)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onOpen(request)}
                  className="grid size-9 place-items-center rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-white"
                  aria-label="Open request order details"
                >
                  <Eye className="size-4" />
                </button>
              </div>

              <div className="mt-4 rounded-2xl bg-neutral-50 p-3 dark:bg-neutral-900">
                <p className="text-xs font-black uppercase text-neutral-400">
                  Service Items
                </p>
                <p className="mt-1 text-sm font-bold text-neutral-700 dark:text-neutral-300">
                  {request.itemCount} item{request.itemCount === 1 ? '' : 's'} ·{' '}
                  {itemPreview || 'No items'}
                  {request.itemCount > 3
                    ? ` +${request.itemCount - 3} more`
                    : ''}
                </p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-neutral-50 p-3 dark:bg-neutral-900">
                  <p className="text-[10px] font-black uppercase text-neutral-400">
                    Assigned
                  </p>
                  <p className="mt-1 text-sm font-black">
                    {request.assignedToName || 'Unassigned'}
                  </p>
                </div>

                <div className="rounded-2xl bg-neutral-50 p-3 dark:bg-neutral-900">
                  <p className="text-[10px] font-black uppercase text-neutral-400">
                    Charge
                  </p>
                  <p className="mt-1 text-sm font-black">
                    {money(request.totalChargeAmount)}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-2">
                {actions.slice(0, 2).map((action) => (
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
                  onClick={() => onOpen(request)}
                  className="h-10 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950"
                >
                  Open Details
                </button>
              </div>
            </article>
          );
        })}

        {!requests.length ? (
          <div className="rounded-[1.5rem] border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-800">
            <p className="font-black text-neutral-600 dark:text-neutral-300">
              No request orders here.
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Matching request orders will appear in this lane.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}