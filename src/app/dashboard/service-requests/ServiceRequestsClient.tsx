'use client';

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  Ban,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Eye,
  Images,
  Maximize2,
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

type ServiceRequestAttachment = {
  id: string;
  imageUrl: string;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  attachmentType: string;
  uploadedByGuest: boolean;
  uploadedByName: string | null;
  createdAt: string;
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
  attachments: ServiceRequestAttachment[];
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
  attachments: ServiceRequestAttachment[];
};

type TabValue = 'LIVE' | 'ALL' | 'BILLED' | 'NOT_BILLED' | 'HISTORY';

type ToastMessage =
  | {
      type: 'success' | 'error';
      text: string;
    }
  | null;

type ServiceRequestServerAction = (formData: FormData) => Promise<unknown>;

type ServiceRequestClientAction = (formData: FormData) => Promise<boolean>;

const serviceRequestSuccessText: Record<string, string> = {
  'request-started': 'Service request order has been started.',
  'request-completed': 'Service request order has been completed.',
  'request-cancelled': 'Service request order has been cancelled.',
  'request-updated': 'Service request order has been updated.',
  'charge-updated': 'Room add-on charge has been posted or updated.',
  'request-item-cancelled': 'Service request item has been cancelled.',
};

function getClientActionError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

function getActionSuccessText(result: unknown, fallback: string) {
  if (
    result &&
    typeof result === 'object' &&
    'success' in result &&
    typeof (result as { success?: unknown }).success === 'string'
  ) {
    const success = (result as { success: string }).success;
    return serviceRequestSuccessText[success] ?? fallback;
  }

  return fallback;
}

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

const moneyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function money(value: number) {
  return moneyFormatter.format(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Invalid date';
  }

  return dateTimeFormatter.format(date);
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentTypeLabel(type: string) {
  return type.replaceAll('_', ' ');
}

function getAttachmentBadgeClass(type: string, uploadedByGuest: boolean) {
  if (uploadedByGuest || type === 'GUEST_UPLOAD') {
    return 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200';
  }

  if (type === 'STAFF_AFTER') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200';
  }

  if (type === 'STAFF_BEFORE') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200';
  }

  return 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300';
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
          ? 'rounded-[2rem] border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10'
          : tone === 'amber'
            ? 'rounded-[2rem] border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10'
            : 'rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900'
      }
    >
      <div className="mb-3 grid size-10 place-items-center rounded-xl bg-black text-white dark:bg-gold dark:text-black">
        <Icon className="size-5" />
      </div>

      <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400">
        {label}
      </p>

      <p className="mt-1 text-2xl font-black text-neutral-950 dark:text-white">
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
  action,
  isMutating,
}: {
  request: RequestGroup;
  status: string;
  label: string;
  tone: 'primary' | 'danger';
  action: ServiceRequestClientAction;
  isMutating: boolean;
}) {
  async function handleSubmit(formData: FormData) {
    await action(formData);
  }

  return (
    <form action={handleSubmit}>
      <input type="hidden" name="hotelId" value={request.hotelId} />
      <input type="hidden" name="requestCode" value={request.requestCode} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="intent" value="status-only" />
      <input type="hidden" name="postCharge" value="false" />
      <input type="hidden" name="assignedToId" value={request.assignedToId} />
      <input
        type="hidden"
        name="note"
        value={`Grouped request order updated to ${statusLabel(status)}`}
      />

      <button
        type="submit"
        disabled={isMutating}
        className={
          tone === 'danger'
            ? 'h-10 w-full rounded-2xl bg-red-600 px-4 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50'
            : 'h-10 w-full rounded-2xl bg-black px-4 text-sm font-black text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gold dark:text-black dark:hover:bg-gold/90'
        }
      >
        {isMutating ? 'Updating...' : label}
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

function isServiceChargeFormKey(key: string) {
  return (
    key === 'postCharge' ||
    key === 'chargeRequestId' ||
    key === 'chargeItemName' ||
    key === 'chargeDescription' ||
    key === 'chargeQuantity' ||
    key === 'chargeUnitPrice' ||
    key.startsWith('chargeItemName_') ||
    key.startsWith('chargeDescription_') ||
    key.startsWith('chargeQuantity_') ||
    key.startsWith('chargeUnitPrice_')
  );
}

function normalizeServiceRequestFormData(formData: FormData) {
  const intent = String(formData.get('intent') || '');

  if (intent !== 'status-only') {
    return formData;
  }

  const cleanFormData = new FormData();

  formData.forEach((value, key) => {
    if (!isServiceChargeFormKey(key)) {
      cleanFormData.append(key, value);
    }
  });

  cleanFormData.set('intent', 'status-only');
  cleanFormData.set('postCharge', 'false');

  return cleanFormData;
}

function AttachmentGallery({
  title,
  attachments,
  compact = false,
}: {
  title: string;
  attachments: ServiceRequestAttachment[];
  compact?: boolean;
}) {
  const [selectedAttachment, setSelectedAttachment] =
    useState<ServiceRequestAttachment | null>(null);

  if (!attachments.length) {
    return null;
  }

  return (
    <>
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-black text-neutral-950 dark:text-white">
              <Images className="size-4 text-gold" />
              {title}
            </p>

            <p className="mt-1 text-xs font-semibold text-neutral-500">
              {attachments.length} photo{attachments.length === 1 ? '' : 's'} attached
            </p>
          </div>
        </div>

        <div
          className={
            compact
              ? 'grid grid-cols-4 gap-2'
              : 'grid grid-cols-2 gap-3 sm:grid-cols-3'
          }
        >
          {attachments.map((attachment) => (
            <button
              key={attachment.id}
              type="button"
              onClick={() => setSelectedAttachment(attachment)}
              className="group overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 text-left transition hover:border-gold dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div
                className={
                  compact
                    ? 'relative aspect-square bg-neutral-100 dark:bg-neutral-800'
                    : 'relative aspect-[4/3] bg-neutral-100 dark:bg-neutral-800'
                }
              >
                <img
                  src={attachment.imageUrl}
                  alt={attachment.originalName || 'Service request attachment'}
                  className="size-full object-cover"
                />

                <span className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100">
                  <Maximize2 className="size-4" />
                </span>
              </div>

              {!compact ? (
                <div className="p-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${getAttachmentBadgeClass(
                      attachment.attachmentType,
                      attachment.uploadedByGuest
                    )}`}
                  >
                    {attachment.uploadedByGuest
                      ? 'Guest Upload'
                      : attachmentTypeLabel(attachment.attachmentType)}
                  </span>

                  <p className="mt-2 truncate text-xs font-black text-neutral-800 dark:text-neutral-200">
                    {attachment.originalName || 'Uploaded photo'}
                  </p>

                  <p className="mt-1 text-[11px] font-bold text-neutral-400">
                    {formatFileSize(attachment.sizeBytes)}
                  </p>
                </div>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {selectedAttachment ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/80 px-4 py-4">
          <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-neutral-900">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-100 p-4 dark:border-neutral-800">
              <div className="min-w-0">
                <p className="text-lg font-black text-neutral-950 dark:text-white">
                  {selectedAttachment.originalName || 'Service Request Photo'}
                </p>

                <p className="mt-1 text-xs font-semibold text-neutral-500">
                  {selectedAttachment.uploadedByGuest
                    ? 'Uploaded by guest'
                    : `Uploaded by ${selectedAttachment.uploadedByName || 'staff'}`} ·{' '}
                  {formatDateTime(selectedAttachment.createdAt)} ·{' '}
                  {formatFileSize(selectedAttachment.sizeBytes)}
                </p>

                {selectedAttachment.caption ? (
                  <p className="mt-2 text-sm font-semibold text-neutral-600 dark:text-neutral-300">
                    {selectedAttachment.caption}
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setSelectedAttachment(null)}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-white"
                aria-label="Close photo preview"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-black">
              <img
                src={selectedAttachment.imageUrl}
                alt={selectedAttachment.originalName || 'Service request attachment'}
                className="mx-auto max-h-[72vh] w-auto object-contain"
              />
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-neutral-100 p-4 dark:border-neutral-800">
              <span
                className={`rounded-full px-3 py-1 text-xs font-black uppercase ${getAttachmentBadgeClass(
                  selectedAttachment.attachmentType,
                  selectedAttachment.uploadedByGuest
                )}`}
              >
                {selectedAttachment.uploadedByGuest
                  ? 'Guest Upload'
                  : attachmentTypeLabel(selectedAttachment.attachmentType)}
              </span>

              <a
                href={selectedAttachment.imageUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-2xl bg-black px-4 text-sm font-black text-white hover:bg-neutral-800 dark:bg-gold dark:text-black"
              >
                <Download className="size-4" />
                Open / Download
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
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

    {item.attachments?.length ? (
  <div className="mt-3">
    <AttachmentGallery
      title="Item Photos"
      attachments={item.attachments}
      compact
    />
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
  action,
  isMutating,
}: {
  item: ServiceRequestOrderItem;
  requestCode: string;
  onClose: () => void;
  action: ServiceRequestClientAction;
  isMutating: boolean;
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

  async function handleCancelServiceItem(formData: FormData) {
    const ok = await action(formData);

    if (ok) {
      onClose();
    }
  }

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

        <form action={handleCancelServiceItem} className="space-y-4">
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
              disabled={isMutating}
              className="h-11 rounded-2xl bg-red-600 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isMutating ? 'Cancelling...' : 'Confirm Cancel'}
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
  updateAction,
  cancelItemAction,
  isMutating,
}: {
  request: RequestGroup;
  statuses: string[];
  staff: StaffOption[];
  onClose: () => void;
  updateAction: ServiceRequestClientAction;
  cancelItemAction: ServiceRequestClientAction;
  isMutating: boolean;
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

  async function handleSaveRequest(formData: FormData) {
    const ok = await updateAction(formData);

    if (ok) {
      onClose();
    }
  }

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
              <AttachmentGallery
                title="Request Photos"
                attachments={request.attachments ?? []}
              />

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
                action={handleSaveRequest}
                className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800"
              >
                <input
                  type="hidden"
                  name="requestCode"
                  value={request.requestCode}
                />
                <input type="hidden" name="hotelId" value={request.hotelId} />
                <input
                  type="hidden"
                  name="intent"
                  value={postCharge ? 'post-charge' : 'status-only'}
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

                    <span>
                      Post or update room add-on charges for selected items.
                    </span>
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
                    disabled={isMutating}
                    className="h-11 rounded-2xl bg-black text-sm font-black text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gold dark:text-black dark:hover:bg-gold/90"
                  >
                    {isMutating ? 'Saving...' : 'Save Request Order'}
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
          action={cancelItemAction}
          isMutating={isMutating}
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
    <div className="fixed right-6 top-24 z-[140] w-[calc(100vw-2.5rem)] max-w-md">
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
  summary: _summary,
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
  const router = useRouter();

  const [localRequests, setLocalRequests] = useState<RequestGroup[]>(requests);
  const [toast, setToast] = useState<ToastMessage>(message ?? null);
  const [isMutating, setIsMutating] = useState(false);

  const [activeTab, setActiveTab] = useState<TabValue>('LIVE');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedRequest, setSelectedRequest] = useState<RequestGroup | null>(
    null
  );

  useEffect(() => {
    setLocalRequests(requests);
  }, [requests]);

  useEffect(() => {
    if (!message) {
      return;
    }

    setToast(message);

    const url = new URL(window.location.href);
    url.searchParams.delete('success');
    url.searchParams.delete('error');

    window.history.replaceState(
      null,
      '',
      `${url.pathname}${url.search}${url.hash}`
    );
  }, [message]);

  function patchRequestGroupStatus(
    request: RequestGroup,
    formData: FormData
  ): RequestGroup {
    const requestCode = String(formData.get('requestCode') || '');
    const requestId = String(formData.get('requestId') || '');
    const nextStatus = String(formData.get('status') || request.status);
    const assignedToId = String(formData.get('assignedToId') || '');

    const matchesRequest =
      (requestCode && request.requestCode === requestCode) ||
      (requestId && request.items.some((item) => item.id === requestId));

    if (!matchesRequest) {
      return request;
    }

    const assignedToName = assignedToId
      ? staff.find((staffMember) => staffMember.id === assignedToId)?.name ??
        request.assignedToName
      : '';

    return {
      ...request,
      status: nextStatus,
      assignedToId,
      assignedToName,
      updatedAt: new Date().toISOString(),
      items: request.items.map((item) => ({
        ...item,
        status: nextStatus,
        assignedToId,
        assignedToName,
      })),
    };
  }

  function patchCancelledItem(
    request: RequestGroup,
    formData: FormData
  ): RequestGroup {
    const requestId = String(formData.get('requestId') || '');

    if (!request.items.some((item) => item.id === requestId)) {
      return request;
    }

    const nextItems = request.items.map((item) =>
      item.id === requestId
        ? {
            ...item,
            status: 'CANCELLED',
            charge: null,
          }
        : item
    );

    const billedCount = nextItems.filter((item) => item.charge).length;
    const totalChargeAmount = nextItems.reduce(
      (total, item) => total + (item.charge?.totalAmount ?? 0),
      0
    );

    return {
      ...request,
      status: nextItems.every((item) => item.status === 'CANCELLED')
        ? 'CANCELLED'
        : request.status,
      billedCount,
      totalChargeAmount,
      updatedAt: new Date().toISOString(),
      items: nextItems,
    };
  }

  async function runServiceRequestAction({
    formData,
    action,
    optimisticUpdate,
    successText,
  }: {
    formData: FormData;
    action: ServiceRequestServerAction;
    optimisticUpdate: (request: RequestGroup) => RequestGroup;
    successText: string;
  }) {
    if (isMutating) {
      return false;
    }

    const previousRequests = localRequests;
    const previousSelectedRequest = selectedRequest;

    setToast(null);
    setIsMutating(true);

    setLocalRequests((currentRequests) =>
      currentRequests.map((request) => optimisticUpdate(request))
    );

    setSelectedRequest((currentRequest) =>
      currentRequest ? optimisticUpdate(currentRequest) : currentRequest
    );

    try {
      const result = await action(formData);

      setToast({
        type: 'success',
        text: getActionSuccessText(result, successText),
      });

      router.refresh();

      return true;
    } catch (error) {
      setLocalRequests(previousRequests);
      setSelectedRequest(previousSelectedRequest);

      setToast({
        type: 'error',
        text: getClientActionError(error),
      });

      return false;
    } finally {
      setIsMutating(false);
    }
  }

  async function handleUpdateServiceRequest(formData: FormData) {
    const normalizedFormData = normalizeServiceRequestFormData(formData);

    return runServiceRequestAction({
      formData: normalizedFormData,
      action: updateServiceRequestAction,
      optimisticUpdate: (request) =>
        patchRequestGroupStatus(request, normalizedFormData),
      successText: 'Service request order has been updated.',
    });
  }

  async function handleCancelServiceRequestItem(formData: FormData) {
    return runServiceRequestAction({
      formData,
      action: cancelServiceRequestItemAction,
      optimisticUpdate: (request) => patchCancelledItem(request, formData),
      successText: 'Service request item has been cancelled.',
    });
  }

  const clientSummary = useMemo(() => {
    const liveRequests = localRequests.filter(
      (request) => request.status === 'NEW' || request.status === 'IN_PROGRESS'
    ).length;

    const billedRequests = localRequests.filter(
      (request) => request.billedCount > 0
    ).length;

    const totalBilledAmount = localRequests.reduce(
      (total, request) => total + request.totalChargeAmount,
      0
    );

    return {
      totalRequests: localRequests.length,
      liveRequests,
      billedRequests,
      notBilledRequests: localRequests.length - billedRequests,
      totalBilledAmount,
    };
  }, [localRequests]);

  const filteredRequests = useMemo(() => {
    const search = deferredQuery.trim().toLowerCase();

    return localRequests.filter((request) => {
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
  }, [activeTab, deferredQuery, localRequests, statusFilter]);

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
      <Toast message={toast} />
      <div className="mb-6 grid gap-3 md:grid-cols-5">
        <SummaryCard
          label="Total Request Orders"
          value={clientSummary.totalRequests}
          icon={MessageCircle}
        />
        <SummaryCard
          label="Live Request Orders"
          value={clientSummary.liveRequests}
          icon={Clock}
          tone="amber"
        />
        <SummaryCard
          label="Billed"
          value={clientSummary.billedRequests}
          icon={CreditCard}
          tone="green"
        />
        <SummaryCard
          label="Not Billed"
          value={clientSummary.notBilledRequests}
          icon={ReceiptText}
          tone="amber"
        />
        <SummaryCard
          label="Add-on Revenue"
          value={money(clientSummary.totalBilledAmount)}
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
        <div className="grid gap-4 xl:grid-cols-2">
          <RequestLane
            title="New"
            description="Grouped service request orders waiting for staff action."
            requests={newRequests}
            statuses={statuses}
            onOpen={setSelectedRequest}
            updateAction={handleUpdateServiceRequest}
            isMutating={isMutating}
          />

          <RequestLane
            title="In Progress"
            description="Grouped request orders currently being handled."
            requests={inProgressRequests}
            statuses={statuses}
            onOpen={setSelectedRequest}
            updateAction={handleUpdateServiceRequest}
            isMutating={isMutating}
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
          updateAction={handleUpdateServiceRequest}
          isMutating={isMutating}
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
            updateAction={handleUpdateServiceRequest}
            isMutating={isMutating}
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
          updateAction={handleUpdateServiceRequest}
          cancelItemAction={handleCancelServiceRequestItem}
          isMutating={isMutating}
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
  updateAction,
  isMutating,
  wide,
}: {
  title: string;
  description: string;
  requests: RequestGroup[];
  statuses: string[];
  onOpen: (request: RequestGroup) => void;
  updateAction: ServiceRequestClientAction;
  isMutating: boolean;
  wide?: boolean;
}) {
  const isNewLane = title.toLowerCase().includes('new');
  const isProgressLane = title.toLowerCase().includes('progress');

  const laneToneClass = isNewLane
    ? 'border-amber-200 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/10'
    : isProgressLane
      ? 'border-blue-200 bg-blue-50/50 dark:border-blue-500/20 dark:bg-blue-500/10'
      : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900';

  return (
    <section
      className={`flex min-h-[560px] flex-col overflow-hidden rounded-[2rem] border shadow-sm ${laneToneClass}`}
    >
      <div className="shrink-0 border-b border-black/5 bg-white/70 p-4 backdrop-blur dark:border-white/10 dark:bg-neutral-950/70">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xl font-black text-neutral-950 dark:text-white">
              {title}
            </h3>

            <p className="mt-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              {description}
            </p>
          </div>

          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-black text-sm font-black text-white dark:bg-gold dark:text-black">
            {requests.length}
          </span>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto p-3"
      >
        {requests.length ? (
          <div
            className={
              wide
                ? 'grid gap-3 md:grid-cols-2 2xl:grid-cols-3'
                : 'grid gap-3'
            }
          >
            {requests.map((request) => {
              const actions = nextActionsForStatus(request.status, statuses);
              const primaryAction = actions[0];

              const itemPreview = request.items
                .map((item) => item.type)
                .join(', ');

              const hasPhotos = request.attachments.length > 0;
              const hasCharge = request.totalChargeAmount > 0;

              return (
                <article
                  key={request.id}
                  className="rounded-[1.25rem] border border-neutral-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate text-sm font-black text-neutral-950 dark:text-white">
                          {request.requestCode}
                        </h4>

                        <StatusPill status={request.status} />

                        <BillingPill
                          billedCount={request.billedCount}
                          itemCount={request.itemCount}
                        />
                      </div>

                      <p className="mt-1 truncate text-xs font-bold text-neutral-500 dark:text-neutral-400">
                        {request.roomLabel} · {request.guestName || 'Guest'}
                      </p>

                      <p className="mt-0.5 text-[11px] font-semibold text-neutral-400">
                        {formatDateTime(request.createdAt)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpen(request)}
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700"
                      aria-label="Open request order details"
                    >
                      <Eye className="size-4" />
                    </button>
                  </div>

                  <div className="mt-3 rounded-2xl bg-neutral-50 p-3 dark:bg-neutral-900">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-400">
                        Service Items
                      </p>

                      <span className="rounded-full bg-black px-2.5 py-1 text-[10px] font-black text-white dark:bg-gold dark:text-black">
                        {request.itemCount}
                      </span>
                    </div>

                    <p className="mt-1 max-h-10 overflow-hidden text-xs font-bold leading-5 text-neutral-700 dark:text-neutral-300">
                      {itemPreview || 'No service items'}
                    </p>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-neutral-50 p-2 dark:bg-neutral-900">
                      <p className="text-[9px] font-black uppercase text-neutral-400">
                        Assigned
                      </p>
                      <p className="mt-1 truncate text-xs font-black text-neutral-950 dark:text-white">
                        {request.assignedToName || 'Unassigned'}
                      </p>
                    </div>

                    <div className="rounded-xl bg-neutral-50 p-2 dark:bg-neutral-900">
                      <p className="text-[9px] font-black uppercase text-neutral-400">
                        Charge
                      </p>
                      <p
                        className={
                          hasCharge
                            ? 'mt-1 truncate text-xs font-black text-emerald-700 dark:text-emerald-300'
                            : 'mt-1 truncate text-xs font-black text-neutral-500'
                        }
                      >
                        {money(request.totalChargeAmount)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-neutral-50 p-2 dark:bg-neutral-900">
                      <p className="text-[9px] font-black uppercase text-neutral-400">
                        Photos
                      </p>
                      <p
                        className={
                          hasPhotos
                            ? 'mt-1 truncate text-xs font-black text-blue-700 dark:text-blue-300'
                            : 'mt-1 truncate text-xs font-black text-neutral-500'
                        }
                      >
                        {request.attachments.length}
                      </p>
                    </div>
                  </div>

                  {hasPhotos ? (
                    <div className="mt-3 flex items-center gap-2 rounded-xl bg-blue-50 p-2 text-[11px] font-black text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">
                      <Images className="size-3.5" />
                      {request.attachments.length} photo
                      {request.attachments.length === 1 ? '' : 's'} attached
                    </div>
                  ) : null}

                  <div className="mt-3 grid gap-2">
                    {primaryAction ? (
                      <QuickStatusAction
                        request={request}
                        status={primaryAction.status}
                        label={primaryAction.label}
                        tone={primaryAction.tone}
                        action={updateAction}
                        isMutating={isMutating}
                      />
                    ) : null}

                    <button
                      type="button"
                      onClick={() => onOpen(request)}
                      className="h-9 rounded-xl border border-neutral-200 bg-white px-4 text-xs font-black transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white dark:hover:bg-neutral-900"
                    >
                      Open Details
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid h-full min-h-64 place-items-center rounded-[1.5rem] border border-dashed border-neutral-300 bg-white/70 p-8 text-center dark:border-neutral-800 dark:bg-neutral-950/70">
            <div>
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                <MessageCircle className="size-5" />
              </div>

              <p className="mt-4 font-black text-neutral-600 dark:text-neutral-300">
                No request orders here.
              </p>

              <p className="mt-1 text-sm text-neutral-500">
                Matching service requests will appear in this lane.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}