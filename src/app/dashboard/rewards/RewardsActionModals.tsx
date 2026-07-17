'use client';

import {
  type FormEvent,
  type ReactNode,
  useMemo,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  Gift,
  Medal,
  Plus,
  Sparkles,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  createGuestMemberAction,
  createRewardAction,
  manualPointAdjustmentAction,
} from './actions';
import {
  RewardsToast,
  type RewardsToastMessage,
} from './RewardsToast';

type HotelOption = {
  id: string;
  name: string;
};

type MemberOption = {
  id: string;
  hotelId: string;
  hotelName: string;
  name: string;
  contact: string;
  availablePoints: number;
};

type ActiveModal = 'member' | 'reward' | 'adjustment' | null;

type ToastActionType =
  | 'added'
  | 'edited'
  | 'deleted'
  | 'failed'
  | 'used'
  | 'refunded';

type ServerFormAction = (formData: FormData) => Promise<void>;

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Action failed. Please check the form and try again.';
}

function Modal({
  open,
  title,
  description,
  icon: Icon,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  icon: LucideIcon;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/55 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6">
      <div role="dialog" aria-modal="true" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-[1.5rem] bg-white p-4 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:rounded-[2rem] sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#fff8e7] text-[#b88938]">
              <Icon className="size-5" />
            </span>

            <div>
              <h2 className="text-xl font-black text-[#11100b]">{title}</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-neutral-500">
                {description}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            aria-label="Close modal"
          >
            <X className="size-5" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-20 items-center gap-3 rounded-[1.35rem] border border-neutral-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[#b88938]/40 hover:shadow-[0_18px_45px_rgba(184,137,56,0.14)]"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#fff8e7] text-[#b88938] transition group-hover:bg-[#b88938] group-hover:text-white">
        <Icon className="size-5" />
      </span>

      <span className="min-w-0">
        <span className="block text-sm font-black text-[#11100b]">{title}</span>
        <span className="mt-1 block text-xs font-semibold leading-5 text-neutral-500">
          {description}
        </span>
      </span>
    </button>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  'h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10';

const textAreaClass =
  'min-h-24 w-full resize-none rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10';

const selectClass =
  'h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10';

export function RewardsActionModals({
  hotels,
  members,
  defaultHotelId,
  isSuperAdmin,
}: {
  hotels: HotelOption[];
  members: MemberOption[];
  defaultHotelId: string;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [rewardType, setRewardType] = useState('DISCOUNT_AMOUNT');
  const [memberHotelId, setMemberHotelId] = useState(defaultHotelId);
  const [adjustmentHotelId, setAdjustmentHotelId] = useState(defaultHotelId);
  const [toast, setToast] = useState<RewardsToastMessage | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredMembers = useMemo(() => {
    return members.filter((member) => member.hotelId === adjustmentHotelId);
  }, [adjustmentHotelId, members]);

  function closeModal() {
    if (isPending) {
      return;
    }

    setActiveModal(null);
  }

  function submitForm(
    event: FormEvent<HTMLFormElement>,
    action: ServerFormAction,
    successText: string,
    toastAction: ToastActionType = 'added'
  ) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    setToast(null);

    startTransition(() => {
      void (async () => {
        try {
          await action(formData);

          form.reset();
          setActiveModal(null);

          setToast({
            type: 'success',
            title: 'Success',
            description: successText,
            action: toastAction,
          });

          router.refresh();
        } catch (error) {
          setToast({
            type: 'error',
            title: 'Action failed',
            description: getErrorMessage(error),
            action: 'failed',
          });
        }
      })();
    });
  }

  return (
    <>
      <RewardsToast message={toast} onClose={() => setToast(null)} />

      <section className="rounded-[1.75rem] border border-neutral-200 bg-white p-4 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b88938]">
              Quick Actions
            </p>
            <h2 className="mt-1 text-lg font-black text-[#11100b]">
              Rewards Operations
            </h2>
          </div>

          <span className="inline-flex items-center gap-1 rounded-full bg-[#fff8e7] px-3 py-1 text-xs font-black text-[#9d741f]">
            <Plus className="size-3.5" />
            Create / Adjust
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <ActionButton
            icon={UserPlus}
            title="Add Guest Member"
            description="Create a loyalty account for a guest."
            onClick={() => setActiveModal('member')}
          />

          <ActionButton
            icon={Gift}
            title="Create Global Reward"
            description="Publish one reward to all active hotels."
            onClick={() => setActiveModal('reward')}
          />

          <ActionButton
            icon={Medal}
            title="Manual Adjustment"
            description="Add or deduct points with a ledger trail."
            onClick={() => setActiveModal('adjustment')}
          />
        </div>
      </section>

      <Modal
        open={activeModal === 'member'}
        title="Add Guest Member"
        description="Register a loyalty guest and automatically create their point account."
        icon={UserPlus}
        onClose={closeModal}
      >
        <form
          onSubmit={(event) =>
            submitForm(
              event,
              createGuestMemberAction,
              'Guest member added successfully.',
              'added'
            )
          }
          className="space-y-3"
        >
          {isSuperAdmin ? (
            <FieldLabel label="Hotel">
              <select
                name="hotelId"
                value={memberHotelId}
                onChange={(event) => setMemberHotelId(event.target.value)}
                className={selectClass}
              >
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </option>
                ))}
              </select>
            </FieldLabel>
          ) : null}

          <FieldLabel label="Guest Name">
            <input
              name="name"
              placeholder="Guest name"
              className={inputClass}
              required
            />
          </FieldLabel>

          <div className="grid gap-3 md:grid-cols-2">
            <FieldLabel label="Phone Number">
              <input
                name="phone"
                placeholder="Phone number"
                className={inputClass}
              />
            </FieldLabel>

            <FieldLabel label="Email">
              <input
                name="email"
                type="email"
                placeholder="Email address"
                className={inputClass}
              />
            </FieldLabel>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="h-11 w-full rounded-2xl bg-[#11100b] text-sm font-black text-white disabled:opacity-60"
          >
            {isPending ? 'Saving...' : 'Create Member'}
          </button>
        </form>
      </Modal>

      <Modal
        open={activeModal === 'reward'}
        title="Create Global Reward"
        description="Create one reward and broadcast it to every active CloudView hotel."
        icon={Gift}
        onClose={closeModal}
      >
        <form
          onSubmit={(event) =>
            submitForm(
              event,
              createRewardAction,
              'Global reward added successfully and is now available in the catalog.',
              'added'
            )
          }
          className="space-y-3"
        >
          <div className="rounded-2xl border border-[#c99c38]/25 bg-[#fff8e7] p-3 text-xs font-bold leading-5 text-[#8a641d]">
            This reward will be created for all active hotels. Hotel-specific
            rewards are intentionally hidden from this global console.
          </div>

          <FieldLabel label="Reward Name">
            <input
              name="name"
              placeholder="Example: Free Coffee"
              className={inputClass}
              required
            />
          </FieldLabel>

          <FieldLabel label="Description">
            <textarea
              name="description"
              placeholder="Explain how guests can use this reward."
              className={textAreaClass}
            />
          </FieldLabel>

          <div className="grid gap-3 md:grid-cols-2">
            <FieldLabel label="Points Cost">
              <input
                name="pointsCost"
                type="number"
                min="1"
                placeholder="Example: 25"
                className={inputClass}
                required
              />
            </FieldLabel>

            <FieldLabel label="Reward Type">
              <select
                name="rewardType"
                value={rewardType}
                onChange={(event) => setRewardType(event.target.value)}
                className={selectClass}
              >
                <option value="DISCOUNT_AMOUNT">Peso Discount</option>
                <option value="DISCOUNT_PERCENT">Percent Discount</option>
                <option value="FREE_ITEM">Free Item</option>
                <option value="CUSTOM">Custom Reward</option>
              </select>
            </FieldLabel>
          </div>

          {rewardType === 'DISCOUNT_AMOUNT' ? (
            <FieldLabel label="Discount Amount in Pesos">
              <input
                name="discountPesos"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Example: 100"
                className={inputClass}
                required
              />
            </FieldLabel>
          ) : null}

          {rewardType === 'DISCOUNT_PERCENT' ? (
            <FieldLabel label="Discount Percent">
              <input
                name="discountPercent"
                type="number"
                min="1"
                max="100"
                placeholder="Example: 10"
                className={inputClass}
                required
              />
            </FieldLabel>
          ) : null}

          {rewardType === 'FREE_ITEM' ? (
            <FieldLabel label="Free Product ID Optional">
              <input
                name="freeProductId"
                placeholder="Optional MenuProduct ID"
                className={inputClass}
              />
            </FieldLabel>
          ) : null}

          {rewardType === 'CUSTOM' ? (
            <div className="rounded-2xl bg-[#fff8e7] p-3 text-sm font-bold text-[#8a641d]">
              Custom rewards do not need discount fields. Describe the benefit
              clearly in the description box.
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <FieldLabel label="Valid From Optional">
              <input name="validFrom" type="date" className={inputClass} />
            </FieldLabel>

            <FieldLabel label="Valid Until Optional">
              <input name="validUntil" type="date" className={inputClass} />
            </FieldLabel>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="h-11 w-full rounded-2xl bg-[#11100b] text-sm font-black text-white disabled:opacity-60"
          >
            {isPending ? 'Saving...' : 'Save Global Reward'}
          </button>
        </form>
      </Modal>

      <Modal
        open={activeModal === 'adjustment'}
        title="Manual Point Adjustment"
        description="Add or deduct points while keeping a proper ledger trail."
        icon={Sparkles}
        onClose={closeModal}
      >
        <form
          onSubmit={(event) =>
            submitForm(
              event,
              manualPointAdjustmentAction,
              'Point adjustment applied successfully.',
              'edited'
            )
          }
          className="space-y-3"
        >
          {isSuperAdmin ? (
            <FieldLabel label="Hotel">
              <select
                name="hotelId"
                value={adjustmentHotelId}
                onChange={(event) => setAdjustmentHotelId(event.target.value)}
                className={selectClass}
              >
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </option>
                ))}
              </select>
            </FieldLabel>
          ) : null}

          <FieldLabel label="Guest">
            <select name="guestMemberId" className={selectClass} required>
              <option value="">Select guest</option>
              {filteredMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} — {member.availablePoints} pts
                  {isSuperAdmin ? ` · ${member.hotelName}` : ''}
                </option>
              ))}
            </select>
          </FieldLabel>

          {!filteredMembers.length ? (
            <div className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-700">
              No guests found for this hotel yet.
            </div>
          ) : null}

          <FieldLabel label="Points">
            <input
              name="points"
              type="number"
              placeholder="+50 or -20"
              className={inputClass}
              required
            />
          </FieldLabel>

          <FieldLabel label="Reason">
            <textarea
              name="description"
              placeholder="Reason for adjustment"
              className={textAreaClass}
            />
          </FieldLabel>

          <button
            type="submit"
            disabled={isPending || !filteredMembers.length}
            className="h-11 w-full rounded-2xl bg-[#11100b] text-sm font-black text-white disabled:opacity-60"
          >
            {isPending ? 'Applying...' : 'Apply Adjustment'}
          </button>
        </form>
      </Modal>
    </>
  );
}
