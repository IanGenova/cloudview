'use client';

import type { DashboardModule, Role } from '@prisma/client';
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

type UserDashboardPermission = {
  module: DashboardModule;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
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
  dashboardPermissions: UserDashboardPermission[];
};
type PermissionKey = 'canView' | 'canCreate' | 'canEdit' | 'canDelete';

type PermissionDraft = Record<
  string,
  {
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
  }
>;

type CreateUserDraft = {
  name: string;
  email: string;
  password: string;
  role: Role;
  hotelId: string;
  permissions: PermissionDraft;
};

function createEmptyPermissionDraft(currentUserRole: Role): PermissionDraft {
  const draft: PermissionDraft = {};

  dashboardModuleOptions
    .filter((module) => {
      if (currentUserRole === 'SUPER_ADMIN') {
        return true;
      }

      return !module.superAdminOnly;
    })
    .forEach((module) => {
      draft[module.key] = {
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
      };
    });

  return draft;
}

function createInitialUserDraft({
  allowedRoles,
  hotels,
  currentUserRole,
}: {
  allowedRoles: Role[];
  hotels: HotelOption[];
  currentUserRole: Role;
}): CreateUserDraft {
  const defaultRole = allowedRoles[0] ?? 'STAFF';

  return {
    name: '',
    email: '',
    password: '',
    role: defaultRole,
    hotelId:
      currentUserRole === 'SUPER_ADMIN'
        ? defaultRole === 'SUPER_ADMIN'
          ? ''
          : hotels[0]?.id ?? ''
        : hotels[0]?.id ?? '',
    permissions: createDefaultPermissionDraftForRole({
      role: defaultRole,
      currentUserRole,
    }),
  };
}

type ToastMessage =
  | {
      type: 'success' | 'error';
      text: string;
    }
  | null;

  const dashboardModuleOptions: {
  key: DashboardModule;
  label: string;
  description: string;
  superAdminOnly?: boolean;
}[] = [
  {
    key: 'OVERVIEW' as DashboardModule,
    label: 'Overview',
    description: 'Dashboard summary and quick overview.',
  },
  {
    key: 'HOTELS' as DashboardModule,
    label: 'Hotels',
    description: 'Create and manage hotel records.',
    superAdminOnly: true,
  },
  {
    key: 'HOTEL_GUIDE' as DashboardModule,
    label: 'Hotel Guide',
    description: 'Manage guest portal guide content.',
  },
  {
    key: 'ROOMS_LOCATIONS' as DashboardModule,
    label: 'Rooms & Locations',
    description: 'Manage rooms, locations, and assigned areas.',
  },
  {
    key: 'NFC_TAGS' as DashboardModule,
    label: 'NFC Tags',
    description: 'Manage NFC guest access tags.',
  },
  {
    key: 'MENU' as DashboardModule,
    label: 'Menu',
    description: 'Manage food menu products and bundles.',
  },
  {
    key: 'INVENTORY' as DashboardModule,
    label: 'Inventory',
    description: 'Manage menu and service inventory.',
  },
  {
    key: 'ORDERS' as DashboardModule,
    label: 'Orders',
    description: 'Manage guest food orders.',
  },
  {
    key: 'KITCHEN_DISPLAY' as DashboardModule,
    label: 'Kitchen Display',
    description: 'Access kitchen order display.',
  },
  {
    key: 'SERVICES_MODULE' as DashboardModule,
    label: 'Services Module',
    description: 'Manage hotel service catalog.',
  },
  {
    key: 'SERVICE_REQUESTS' as DashboardModule,
    label: 'Service Requests',
    description: 'Manage guest service requests.',
  },
  {
    key: 'POS_TERMINAL' as DashboardModule,
    label: 'POS Terminal',
    description: 'Access food and service POS.',
  },
  {
    key: 'ANALYTICS' as DashboardModule,
    label: 'Analytics',
    description: 'View reports and analytics.',
  },
  {
    key: 'HOTEL_SETTINGS' as DashboardModule,
    label: 'Hotel Settings',
    description: 'Edit hotel-level configuration.',
  },
  {
    key: 'USER_ACCOUNT_SETTINGS' as DashboardModule,
    label: 'User Account Settings',
    description: 'Manage dashboard users and access.',
  },

  {
  key: 'REPORTS' as DashboardModule,
  label: 'Reports',
  description: 'View operational reports and summaries.',
},
{
  key: 'GUEST_STAYS' as DashboardModule,
  label: 'Guest Stays',
  description: 'Manage checked-in guests, passcodes, and stay records.',
},
{
  key: 'REWARDS' as DashboardModule,
  label: 'Rewards',
  description: 'Manage guest rewards, points, and loyalty settings.',
},
];

const permissionColumns = [
  {
    key: 'canView',
    label: 'View',
  },
  {
    key: 'canCreate',
    label: 'Create',
  },
  {
    key: 'canEdit',
    label: 'Edit',
  },
  {
    key: 'canDelete',
    label: 'Delete',
  },
] as const;

function getVisibleModuleOptions(currentUserRole: Role) {
  return dashboardModuleOptions.filter((module) => {
    if (currentUserRole === 'SUPER_ADMIN') {
      return true;
    }

    return !module.superAdminOnly;
  });
}

function emptyPermissionValue() {
  return {
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
  };
}

function fullPermissionValue() {
  return {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
  };
}

function viewOnlyPermissionValue() {
  return {
    canView: true,
    canCreate: false,
    canEdit: false,
    canDelete: false,
  };
}

function normalizePermissionValue(
  current: PermissionDraft[string],
  key: PermissionKey,
  checked: boolean
) {
  const next = {
    ...current,
    [key]: checked,
  };

  if (key !== 'canView' && checked) {
    next.canView = true;
  }

  if (key === 'canView' && !checked) {
    next.canCreate = false;
    next.canEdit = false;
    next.canDelete = false;
  }

  return next;
}

function createPermissionDraftFromSaved({
  permissions,
  currentUserRole,
}: {
  permissions?: UserDashboardPermission[];
  currentUserRole: Role;
}) {
  const draft = createEmptyPermissionDraft(currentUserRole);

  const savedMap = new Map(
    (permissions ?? []).map((permission) => [permission.module, permission])
  );

  for (const module of getVisibleModuleOptions(currentUserRole)) {
    const saved = savedMap.get(module.key);

    draft[module.key] = {
      canView: Boolean(saved?.canView),
      canCreate: Boolean(saved?.canCreate),
      canEdit: Boolean(saved?.canEdit),
      canDelete: Boolean(saved?.canDelete),
    };
  }

  return draft;
}

function createDefaultPermissionDraftForRole({
  role,
  currentUserRole,
}: {
  role: Role;
  currentUserRole: Role;
}) {
  const draft = createEmptyPermissionDraft(currentUserRole);

  function setModule(moduleKey: string, value: PermissionDraft[string]) {
    if (draft[moduleKey]) {
      draft[moduleKey] = value;
    }
  }

  if (role === 'SUPER_ADMIN' || role === 'HOTEL_ADMIN') {
    for (const module of getVisibleModuleOptions(currentUserRole)) {
      if (role === 'HOTEL_ADMIN' && module.key === ('HOTELS' as DashboardModule)) {
        continue;
      }

      draft[module.key] = fullPermissionValue();
    }

    return draft;
  }

  if (role === 'KITCHEN') {
    setModule('OVERVIEW', viewOnlyPermissionValue());
    setModule('ORDERS', viewOnlyPermissionValue());
    setModule('KITCHEN_DISPLAY', {
      canView: true,
      canCreate: false,
      canEdit: true,
      canDelete: false,
    });
    setModule('INVENTORY', viewOnlyPermissionValue());

    return draft;
  }

  setModule('OVERVIEW', viewOnlyPermissionValue());
  setModule('REPORTS', viewOnlyPermissionValue());
  setModule('HOTEL_GUIDE', viewOnlyPermissionValue());
  setModule('ROOMS_LOCATIONS', viewOnlyPermissionValue());
  setModule('NFC_TAGS', viewOnlyPermissionValue());
  setModule('GUEST_STAYS', viewOnlyPermissionValue());

  setModule('MENU', {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
  });

  setModule('INVENTORY', {
    canView: true,
    canCreate: false,
    canEdit: true,
    canDelete: false,
  });

  setModule('ORDERS', {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
  });

  setModule('KITCHEN_DISPLAY', viewOnlyPermissionValue());

  setModule('SERVICES_MODULE', {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
  });

  setModule('SERVICE_REQUESTS', {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
  });

  setModule('REWARDS', {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
  });

  setModule('POS_TERMINAL', {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
  });

  setModule('ANALYTICS', viewOnlyPermissionValue());

  return draft;
}

function PermissionMatrix({
  permissions,
  currentUserRole,
  compact = false,
  permissionDraft,
  onPermissionChange,
}: {
  permissions?: UserDashboardPermission[];
  currentUserRole: Role;
  compact?: boolean;
  permissionDraft?: PermissionDraft;
  onPermissionChange?: (
    module: DashboardModule,
    key: PermissionKey,
    checked: boolean
  ) => void;
}) {
  const isControlled = Boolean(permissionDraft && onPermissionChange);

  const visibleModules = getVisibleModuleOptions(currentUserRole);

  const [localDraft, setLocalDraft] = useState<PermissionDraft>(() =>
    createPermissionDraftFromSaved({
      permissions,
      currentUserRole,
    })
  );

  useEffect(() => {
    if (isControlled) {
      return;
    }

    setLocalDraft(
      createPermissionDraftFromSaved({
        permissions,
        currentUserRole,
      })
    );
  }, [permissions, currentUserRole, isControlled]);

  const activeDraft = isControlled ? permissionDraft ?? {} : localDraft;

  function getModuleValue(module: DashboardModule) {
    return activeDraft[module] ?? emptyPermissionValue();
  }

  function applyDraft(nextDraft: PermissionDraft) {
    if (isControlled) {
      for (const module of visibleModules) {
        const currentValue = getModuleValue(module.key);
        const nextValue = nextDraft[module.key] ?? emptyPermissionValue();

        for (const column of permissionColumns) {
          if (currentValue[column.key] !== nextValue[column.key]) {
            onPermissionChange?.(
              module.key,
              column.key,
              nextValue[column.key]
            );
          }
        }
      }

      return;
    }

    setLocalDraft(nextDraft);
  }

  function cloneActiveDraft() {
    const nextDraft: PermissionDraft = {
      ...activeDraft,
    };

    for (const module of visibleModules) {
      nextDraft[module.key] = {
        ...getModuleValue(module.key),
      };
    }

    return nextDraft;
  }

  function updatePermission(
    module: DashboardModule,
    key: PermissionKey,
    checked: boolean
  ) {
    const nextDraft = cloneActiveDraft();

    nextDraft[module] = normalizePermissionValue(
      nextDraft[module] ?? emptyPermissionValue(),
      key,
      checked
    );

    applyDraft(nextDraft);
  }

  function setModulePreset(
    module: DashboardModule,
    value: PermissionDraft[string]
  ) {
    const nextDraft = cloneActiveDraft();

    nextDraft[module] = value;

    applyDraft(nextDraft);
  }

  function setAllModules(value: PermissionDraft[string]) {
    const nextDraft = cloneActiveDraft();

    for (const module of visibleModules) {
      nextDraft[module.key] = {
        ...value,
      };
    }

    applyDraft(nextDraft);
  }

  function setColumnAll(key: PermissionKey, checked: boolean) {
    const nextDraft = cloneActiveDraft();

    for (const module of visibleModules) {
      nextDraft[module.key] = normalizePermissionValue(
        nextDraft[module.key] ?? emptyPermissionValue(),
        key,
        checked
      );
    }

    applyDraft(nextDraft);
  }

  const allSelected = visibleModules.every((module) => {
    const value = getModuleValue(module.key);

    return (
      value.canView &&
      value.canCreate &&
      value.canEdit &&
      value.canDelete
    );
  });

  const visibleCount = visibleModules.filter(
    (module) => getModuleValue(module.key).canView
  ).length;

  return (
    <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-4">
      <input type="hidden" name="permissionsEnabled" value="1" />

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-black">Dashboard Module Access</p>
          <p className="mt-1 text-xs font-bold leading-5 text-neutral-500">
            Select which dashboard pages and functions this user can access.
          </p>

          <p className="mt-2 text-xs font-black text-neutral-600">
            {visibleCount} of {visibleModules.length} modules visible
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAllModules(fullPermissionValue())}
            className="h-9 rounded-xl bg-black px-3 text-xs font-black text-white hover:bg-neutral-800"
          >
            Select All
          </button>

          <button
            type="button"
            onClick={() => setAllModules(viewOnlyPermissionValue())}
            className="h-9 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-black hover:bg-neutral-100"
          >
            View Only All
          </button>

          <button
            type="button"
            onClick={() => setAllModules(emptyPermissionValue())}
            className="h-9 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-black text-red-700 hover:bg-red-100"
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-2 rounded-2xl border border-neutral-200 bg-white p-3 sm:grid-cols-2 xl:grid-cols-4">
        {permissionColumns.map((column) => (
          <button
            key={`select-column-${column.key}`}
            type="button"
            onClick={() => setColumnAll(column.key, true)}
            className="h-9 rounded-xl bg-neutral-100 px-3 text-xs font-black text-neutral-700 hover:bg-neutral-200"
          >
            Select All {column.label}
          </button>
        ))}
      </div>

      <div
        className={
          compact
            ? 'max-h-[320px] space-y-3 overflow-y-auto pr-1'
            : 'max-h-[520px] space-y-3 overflow-y-auto pr-1'
        }
      >
        {visibleModules.map((module) => {
          const value = getModuleValue(module.key);

          return (
            <div
              key={module.key}
              className="rounded-2xl border border-neutral-200 bg-white p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-black leading-tight">
                    {module.label}
                  </p>
                  <p className="mt-1 text-xs font-bold leading-5 text-neutral-500">
                    {module.description}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setModulePreset(module.key, fullPermissionValue())
                    }
                    className="h-8 rounded-xl bg-black px-3 text-[11px] font-black text-white hover:bg-neutral-800"
                  >
                    All
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setModulePreset(module.key, viewOnlyPermissionValue())
                    }
                    className="h-8 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[11px] font-black hover:bg-neutral-100"
                  >
                    View Only
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setModulePreset(module.key, emptyPermissionValue())
                    }
                    className="h-8 rounded-xl border border-red-200 bg-red-50 px-3 text-[11px] font-black text-red-700 hover:bg-red-100"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {permissionColumns.map((column) => {
                  const checked = Boolean(value[column.key]);

                  return (
                    <label
                      key={`${module.key}-${column.key}`}
                      className="flex cursor-pointer items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-black text-neutral-700 transition hover:border-neutral-400 hover:bg-white"
                    >
                      <span>{column.label}</span>

                      <input
                        type="checkbox"
                        name={`permission:${module.key}:${column.key}`}
                        checked={checked}
                        onChange={(event) => {
                          updatePermission(
                            module.key,
                            column.key,
                            event.target.checked
                          );
                        }}
                        className="size-4 cursor-pointer rounded border-neutral-300 accent-black"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {allSelected ? (
        <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-700">
          All permissions are currently selected.
        </p>
      ) : null}
    </div>
  );
}

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
  size = 'default',
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  size?: 'default' | 'wide';
}) {
  const widthClass = size === 'wide' ? 'max-w-3xl' : 'max-w-xl';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-6 sm:items-center">
      <div
        className={`flex max-h-[calc(100dvh-2rem)] w-full ${widthClass} flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl`}
      >
        <div className="shrink-0 border-b border-neutral-100 bg-white px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-black">{title}</h2>

            <button
              type="button"
              onClick={onClose}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-neutral-100 text-sm font-black hover:bg-neutral-200"
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function CreateUserModal({
  hotels,
  allowedRoles,
  currentUserRole,
  onClose,
  onToast,
}: {
  hotels: HotelOption[];
  allowedRoles: Role[];
  currentUserRole: Role;
  onClose: () => void;
  onToast: (message: ToastMessage) => void;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    createUserAccountAction,
    initialState
  );

  const [draft, setDraft] = useState<CreateUserDraft>(() =>
    createInitialUserDraft({
      allowedRoles,
      hotels,
      currentUserRole,
    })
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

  function updateDraft<K extends keyof CreateUserDraft>(
    key: K,
    value: CreateUserDraft[K]
  ) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

 function updateRole(role: Role) {
  setDraft((current) => ({
    ...current,
    role,
    hotelId:
      role === 'SUPER_ADMIN'
        ? ''
        : current.hotelId || hotels[0]?.id || '',
    permissions: createDefaultPermissionDraftForRole({
      role,
      currentUserRole,
    }),
  }));
}

  function updatePermission(
    module: DashboardModule,
    key: PermissionKey,
    checked: boolean
  ) {
    setDraft((current) => {
      const currentModule = current.permissions[module] ?? {
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
      };

      const nextModule = {
        ...currentModule,
        [key]: checked,
      };

      if (
        key !== 'canView' &&
        checked
      ) {
        nextModule.canView = true;
      }

      if (
        key === 'canView' &&
        !checked
      ) {
        nextModule.canCreate = false;
        nextModule.canEdit = false;
        nextModule.canDelete = false;
      }

      return {
        ...current,
        permissions: {
          ...current.permissions,
          [module]: nextModule,
        },
      };
    });
  }

  return (
    <Modal title="Create New User" onClose={onClose} size="wide">
      <form action={formAction} className="space-y-4">
        <StateMessage state={state} />

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Full Name
            </label>
            <input
              name="name"
              required
              value={draft.name}
              onChange={(event) => updateDraft('name', event.target.value)}
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
              value={draft.email}
              onChange={(event) => updateDraft('email', event.target.value)}
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
              value={draft.password}
              onChange={(event) => updateDraft('password', event.target.value)}
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
              value={draft.role}
              onChange={(event) => updateRole(event.target.value as Role)}
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
            >
              {allowedRoles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Hotel Access
            </label>
            <select
              name="hotelId"
              value={draft.hotelId}
              onChange={(event) => updateDraft('hotelId', event.target.value)}
              disabled={
                currentUserRole !== 'SUPER_ADMIN' ||
                draft.role === 'SUPER_ADMIN'
              }
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

            {draft.role !== 'SUPER_ADMIN' && !draft.hotelId ? (
              <p className="mt-1 text-xs font-bold text-red-600">
                Please select a hotel for this role.
              </p>
            ) : null}
          </div>
        </div>

        <PermissionMatrix
          currentUserRole={currentUserRole}
          compact
          permissionDraft={draft.permissions}
          onPermissionChange={updatePermission}
        />

        <div className="sticky bottom-0 -mx-6 flex justify-end gap-2 border-t border-neutral-200 bg-white/95 px-6 py-4 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50"
          >
            Cancel
          </button>

          <SubmitButton>Create User Account</SubmitButton>
        </div>
      </form>
    </Modal>
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

      <PermissionMatrix
        permissions={account.dashboardPermissions}
        currentUserRole={currentUserRole}
        compact
      />

      <div className="sticky bottom-0 -mx-6 flex justify-end gap-2 border-t border-neutral-200 bg-white/95 px-6 py-4 backdrop-blur">
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
  const [toast, setToast] = useState<ToastMessage>(null);

  const [creatingUser, setCreatingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [resetPasswordUser, setResetPasswordUser] =
    useState<UserAccount | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserAccount | null>(null);

  return (
    <>
      <Toast message={toast} onClose={() => setToast(null)} />

      <div className="space-y-5">
        <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
            <div>
              <h2 className="text-xl font-black">Existing Users</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Create users, edit accounts, reset passwords, delete users, and
                manage dashboard module access.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setCreatingUser(true)}
              className="h-11 rounded-2xl bg-black px-5 text-sm font-black text-white hover:bg-neutral-800"
            >
              Create New User
            </button>
          </div>
        </div>

        <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="mt-1 space-y-4">
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

                    <p className="mt-2 text-xs font-bold text-neutral-500">
                      Modules:{' '}
                      <span className="text-neutral-800">
                        {account.dashboardPermissions?.filter(
                          (permission) => permission.canView
                        ).length ?? 0}{' '}
                        visible
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
                  Create your first dashboard user using the Create New User
                  button.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {creatingUser ? (
        <CreateUserModal
          hotels={hotels}
          allowedRoles={allowedRoles}
          currentUserRole={currentUserRole}
          onClose={() => setCreatingUser(false)}
          onToast={setToast}
        />
      ) : null}

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