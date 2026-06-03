'use client';

import type { Role } from '@prisma/client';
import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import {
  createUserAccountAction,
  deleteUserAccountAction,
  resetUserPasswordAction,
  updateUserAccountAction,
  type ActionState,
} from './actions';

type HotelOption = {
  id: string;
  name: string;
};

type UserAccount = {
  id: string;
  name: string;
  email: string;
  role: Role;
  hotelId: string | null;
  hotel: {
    id: string;
    name: string;
  } | null;
};

type ToastMessage =
  | {
      type: 'success' | 'error';
      text: string;
    }
  | null;

const roleLabels: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  HOTEL_ADMIN: 'Hotel Admin',
  STAFF: 'Staff',
  KITCHEN: 'Kitchen',
};

const initialState: ActionState = {
  ok: false,
};

function Toast({
  message,
  onClose,
}: {
  message: ToastMessage;
  onClose: () => void;
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
      onClose();
    }, 4500);

    return () => window.clearTimeout(timeout);
  }, [message, onClose]);

  if (!message || !visible) {
    return null;
  }

  const isSuccess = message.type === 'success';

  return (
    <div className="fixed right-5 top-5 z-[90] w-[calc(100vw-2.5rem)] max-w-md">
      <div
        className={
          isSuccess
            ? 'flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 shadow-2xl'
            : 'flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-2xl'
        }
      >
        <div
          className={
            isSuccess
              ? 'grid size-9 shrink-0 place-items-center rounded-full bg-emerald-600 text-white'
              : 'grid size-9 shrink-0 place-items-center rounded-full bg-red-600 text-white'
          }
        >
          {isSuccess ? (
            <CheckCircle2 className="size-5" />
          ) : (
            <AlertTriangle className="size-5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">
            {isSuccess ? 'Success' : 'Action failed'}
          </p>
          <p className="mt-1 text-sm font-bold leading-6">{message.text}</p>
        </div>

        <button
          type="button"
          onClick={() => {
            setVisible(false);
            onClose();
          }}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70 hover:bg-white"
          aria-label="Close notification"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

function SubmitButton({
  children,
  danger,
}: {
  children: string;
  danger?: boolean;
}) {
  return (
    <button
      type="submit"
      className={
        danger
          ? 'h-11 rounded-2xl bg-red-600 px-5 text-sm font-black text-white hover:bg-red-700'
          : 'h-11 rounded-2xl bg-black px-5 text-sm font-black text-white hover:bg-neutral-800'
      }
    >
      {children}
    </button>
  );
}

function StateMessage({ state }: { state: ActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={
        state.ok
          ? 'rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700'
          : 'rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700'
      }
    >
      {state.message}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
      <div className="w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-xl font-black">{title}</h2>

          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full bg-neutral-100 text-sm font-black hover:bg-neutral-200"
          >
            ✕
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function EditUserModal({
  account,
  hotels,
  allowedRoles,
  currentUserRole,
  onClose,
  onToast,
}: {
  account: UserAccount;
  hotels: HotelOption[];
  allowedRoles: Role[];
  currentUserRole: Role;
  onClose: () => void;
  onToast: (message: ToastMessage) => void;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    updateUserAccountAction,
    initialState
  );

  useEffect(() => {
    if (!state.message) {
      return;
    }

    onToast({
      type: state.ok ? 'success' : 'error',
      text: state.message,
    });

    if (state.ok) {
      router.refresh();
      onClose();
    }
  }, [state, router, onClose, onToast]);

  return (
    <Modal title="Edit User Account" onClose={onClose}>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="userId" value={account.id} />

        <StateMessage state={state} />

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Full Name
          </label>
          <input
            name="name"
            defaultValue={account.name}
            required
            className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Email
          </label>
          <input
            name="email"
            type="email"
            defaultValue={account.email}
            required
            className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            User Role
          </label>
          <select
            name="role"
            defaultValue={account.role}
            className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
          >
            {allowedRoles.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Hotel Access
          </label>
          <select
            name="hotelId"
            defaultValue={account.hotelId ?? ''}
            disabled={currentUserRole !== 'SUPER_ADMIN'}
            className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100"
          >
            {currentUserRole === 'SUPER_ADMIN' ? (
              <option value="">No hotel / Super Admin</option>
            ) : null}

            {hotels.map((hotel) => (
              <option key={hotel.id} value={hotel.id}>
                {hotel.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50"
          >
            Cancel
          </button>
          <SubmitButton>Save Changes</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  account,
  onClose,
  onToast,
}: {
  account: UserAccount;
  onClose: () => void;
  onToast: (message: ToastMessage) => void;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    resetUserPasswordAction,
    initialState
  );

  useEffect(() => {
    if (!state.message) {
      return;
    }

    onToast({
      type: state.ok ? 'success' : 'error',
      text: state.message,
    });

    if (state.ok) {
      router.refresh();
      onClose();
    }
  }, [state, router, onClose, onToast]);

  return (
    <Modal title="Reset Password" onClose={onClose}>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="userId" value={account.id} />

        <StateMessage state={state} />

        <div className="rounded-2xl bg-neutral-50 p-4 text-sm">
          <p className="font-black">{account.name}</p>
          <p className="text-neutral-500">{account.email}</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            New Password
          </label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="Minimum 8 characters"
            className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Confirm Password
          </label>
          <input
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            placeholder="Re-enter new password"
            className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
          />
        </div>

        <div className="rounded-2xl bg-amber-50 p-4 text-xs font-bold text-amber-700">
          Password must contain at least 8 characters, one uppercase letter, one
          lowercase letter, and one number.
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50"
          >
            Cancel
          </button>
          <SubmitButton>Reset Password</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

function DeleteUserModal({
  account,
  onClose,
  onToast,
}: {
  account: UserAccount;
  onClose: () => void;
  onToast: (message: ToastMessage) => void;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    deleteUserAccountAction,
    initialState
  );

  useEffect(() => {
    if (!state.message) {
      return;
    }

    onToast({
      type: state.ok ? 'success' : 'error',
      text: state.message,
    });

    if (state.ok) {
      router.refresh();
      onClose();
    }
  }, [state, router, onClose, onToast]);

  return (
    <Modal title="Delete User Account" onClose={onClose}>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="userId" value={account.id} />

        <StateMessage state={state} />

        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-black">This action cannot be undone.</p>
          <p className="mt-1">
            You are about to delete <strong>{account.name}</strong> with email{' '}
            <strong>{account.email}</strong>.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50"
          >
            Cancel
          </button>
          <SubmitButton danger>Delete User</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

export function UserAccountSettingsClient({
  users,
  hotels,
  allowedRoles,
  currentUserRole,
}: {
  users: UserAccount[];
  hotels: HotelOption[];
  allowedRoles: Role[];
  currentUserRole: Role;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<ToastMessage>(null);

  const [createState, createFormAction] = useActionState(
    createUserAccountAction,
    initialState
  );

  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [resetPasswordUser, setResetPasswordUser] =
    useState<UserAccount | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserAccount | null>(null);

  useEffect(() => {
    if (!createState.message) {
      return;
    }

    setToast({
      type: createState.ok ? 'success' : 'error',
      text: createState.message,
    });

    if (createState.ok) {
      router.refresh();
    }
  }, [createState, router]);

  return (
    <>
      <Toast message={toast} onClose={() => setToast(null)} />

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Create New User</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Add a dashboard user and assign their role.
          </p>

          <form action={createFormAction} className="mt-5 space-y-4">
            <StateMessage state={createState} />

            <div>
              <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                Full Name
              </label>
              <input
                name="name"
                required
                placeholder="Juan Dela Cruz"
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                Email
              </label>
              <input
                name="email"
                type="email"
                required
                placeholder="user@email.com"
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                Temporary Password
              </label>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="Minimum 8 characters"
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
              />
              <p className="mt-1 text-xs text-neutral-500">
                Must include uppercase, lowercase, and number.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                User Role
              </label>
              <select
                name="role"
                defaultValue={allowedRoles[0]}
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
              >
                {allowedRoles.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                Hotel Access
              </label>
              <select
                name="hotelId"
                defaultValue=""
                disabled={currentUserRole !== 'SUPER_ADMIN'}
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100"
              >
                {currentUserRole === 'SUPER_ADMIN' ? (
                  <option value="">No hotel / Super Admin</option>
                ) : null}

                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="h-11 w-full rounded-2xl bg-black px-5 text-sm font-black text-white hover:bg-neutral-800"
            >
              Create User Account
            </button>
          </form>
        </div>

        <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Existing Users</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Edit users, reset passwords, or delete user accounts.
          </p>

          <div className="mt-5 space-y-4">
            {users.map((account) => (
              <div
                key={account.id}
                className="rounded-3xl border border-neutral-200 bg-white p-4"
              >
                <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black">{account.name}</h3>
                      <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-700">
                        {roleLabels[account.role]}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-neutral-500">
                      {account.email}
                    </p>

                    <p className="mt-1 text-sm text-neutral-500">
                      Hotel:{' '}
                      <span className="font-bold">
                        {account.hotel?.name ?? 'No hotel assigned'}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingUser(account)}
                      className="h-10 rounded-2xl border border-neutral-200 px-4 text-sm font-black hover:bg-neutral-50"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => setResetPasswordUser(account)}
                      className="h-10 rounded-2xl bg-black px-4 text-sm font-black text-white hover:bg-neutral-800"
                    >
                      Reset Password
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeletingUser(account)}
                      className="h-10 rounded-2xl bg-red-600 px-4 text-sm font-black text-white hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {!users.length ? (
              <div className="rounded-3xl border border-dashed border-neutral-300 p-8 text-center">
                <p className="font-black">No user accounts found.</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Create your first dashboard user from the form.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {editingUser ? (
        <EditUserModal
          account={editingUser}
          hotels={hotels}
          allowedRoles={allowedRoles}
          currentUserRole={currentUserRole}
          onClose={() => setEditingUser(null)}
          onToast={setToast}
        />
      ) : null}

      {resetPasswordUser ? (
        <ResetPasswordModal
          account={resetPasswordUser}
          onClose={() => setResetPasswordUser(null)}
          onToast={setToast}
        />
      ) : null}

      {deletingUser ? (
        <DeleteUserModal
          account={deletingUser}
          onClose={() => setDeletingUser(null)}
          onToast={setToast}
        />
      ) : null}
    </>
  );
}