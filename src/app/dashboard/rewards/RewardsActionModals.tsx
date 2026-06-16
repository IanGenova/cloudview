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
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#fff8e7] text-[#b88938]">
              <Icon className="size-6" />
            </span>

            <div>
              <h2 className="text-2xl font-black text-[#11100b]">{title}</h2>
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
      className="rounded-[1.5rem] border border-neutral-200 bg-white p-5 text-left shadow-[0_18px_45px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:border-[#b88938]/40 hover:shadow-[0_20px_55px_rgba(184,137,56,0.16)]"
    >
      <span className="grid size-11 place-items-center rounded-2xl bg-[#fff8e7] text-[#b88938]">
        <Icon className="size-5" />
      </span>

      <p className="mt-4 text-base font-black text-[#11100b]">{title}</p>

      <p className="mt-1 text-sm font-semibold leading-6 text-neutral-500">
        {description}
      </p>
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
  'h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10';

const textAreaClass =
  'min-h-28 w-full resize-none rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10';

const selectClass =
  'h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10';

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
  const [rewardHotelId, setRewardHotelId] = useState(defaultHotelId);
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
      <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-[#11100b]">
              Rewards Actions
            </h2>
            <p className="mt-1 text-sm font-semibold text-neutral-500">
              Create members, add rewards, and adjust points without crowding the
              page.
            </p>
          </div>

          <span className="rounded-full bg-[#fff8e7] px-3 py-1 text-xs font-black text-[#9d741f]">
            Quick Actions
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <ActionButton
            icon={UserPlus}
            title="Add Guest Member"
            description="Register a guest manually and create a point account."
            onClick={() => setActiveModal('member')}
          />

          <ActionButton
            icon={Gift}
            title="Create Reward"
            description="Add a dynamic reward visible in the guest portal."
            onClick={() => setActiveModal('reward')}
          />

          <ActionButton
            icon={Medal}
            title="Manual Adjustment"
            description="Add or deduct points with a ledger record."
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
          className="space-y-4"
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

          <div className="grid gap-4 md:grid-cols-2">
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
            className="h-12 w-full rounded-2xl bg-[#11100b] text-sm font-black text-white disabled:opacity-60"
          >
            {isPending ? 'Saving...' : 'Create Member'}
          </button>
        </form>
      </Modal>

      <Modal
        open={activeModal === 'reward'}
        title="Create Reward"
        description="Create a dynamic reward. Active rewards will appear in the guest rewards page."
        icon={Gift}
        onClose={closeModal}
      >
        <form
          onSubmit={(event) =>
            submitForm(
                event,
                createRewardAction,
                'Reward added successfully and is now available in the catalog.',
                'added'
                )
          }
          className="space-y-4"
        >
          {isSuperAdmin ? (
            <FieldLabel label="Hotel">
              <select
                name="hotelId"
                value={rewardHotelId}
                onChange={(event) => setRewardHotelId(event.target.value)}
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

          <div className="grid gap-4 md:grid-cols-2">
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
            <div className="rounded-2xl bg-[#fff8e7] p-4 text-sm font-bold text-[#8a641d]">
              Custom rewards do not need discount fields. Describe the benefit
              clearly in the description box.
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
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
            className="h-12 w-full rounded-2xl bg-[#11100b] text-sm font-black text-white disabled:opacity-60"
          >
            {isPending ? 'Saving...' : 'Save Reward'}
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
          className="space-y-4"
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
            className="h-12 w-full rounded-2xl bg-[#11100b] text-sm font-black text-white disabled:opacity-60"
          >
            {isPending ? 'Applying...' : 'Apply Adjustment'}
          </button>
        </form>
      </Modal>
    </>
  );
}