'use client';

import { DashboardToastViewport } from '@/components/dashboard/DashboardToastViewport';

import type { DashboardModule, Role } from '@prisma/client';
import { useActionState, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

import {
  createUserAccountAction,
  deleteUserAccountAction,
  resetUserPasswordAction,
  setUserActiveStateAction,
  updateUserAccountAction,
  type ActionState,
} from './actions';

type HotelOption = {
  id: string;
  name: string;
  isActive: boolean;
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
  isActive: boolean;
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
  confirmPassword: string;
  role: Role;
  hotelId: string;
  permissions: PermissionDraft;
};

function canTargetRoleUseModule(module: DashboardModule, targetRole?: Role) {
  if (!targetRole || targetRole === 'SUPER_ADMIN') {
    return true;
  }

  if (module === ('HOTELS' as DashboardModule)) {
    return false;
  }

  if (module === ('REWARDS' as DashboardModule)) {
    return false;
  }

  if (
    targetRole === 'KITCHEN' &&
    module === ('ORDERS' as DashboardModule)
  ) {
    return false;
  }

  if (
    targetRole !== 'HOTEL_ADMIN' &&
    (module === ('HOTEL_SETTINGS' as DashboardModule) ||
      module === ('USER_ACCOUNT_SETTINGS' as DashboardModule))
  ) {
    return false;
  }

  return true;
}

function getPreferredDefaultRole(allowedRoles: Role[]) {
  return (
    allowedRoles.find((role) => role === 'STAFF') ??
    allowedRoles.find((role) => role === 'KITCHEN') ??
    allowedRoles.find((role) => role === 'HOTEL_ADMIN') ??
    allowedRoles[0] ??
    'STAFF'
  );
}

function createEmptyPermissionDraft({
  currentUserRole,
  targetRole,
}: {
  currentUserRole: Role;
  targetRole?: Role;
}): PermissionDraft {
  const draft: PermissionDraft = {};

  getVisibleModuleOptions(currentUserRole, targetRole).forEach((module) => {
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
  const defaultRole = getPreferredDefaultRole(allowedRoles);

  return {
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
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
  superAdminOnly: true,
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

function getVisibleModuleOptions(currentUserRole: Role, targetRole?: Role) {
  return dashboardModuleOptions.filter((module) => {
    if (currentUserRole !== 'SUPER_ADMIN' && module.superAdminOnly) {
      return false;
    }

    return canTargetRoleUseModule(module.key, targetRole);
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

function isRequiredLandingModule(module: DashboardModule) {
  return module === ('OVERVIEW' as DashboardModule);
}

function forceSafePermissionDraft(draft: PermissionDraft) {
  const nextDraft = {
    ...draft,
  };

  nextDraft.OVERVIEW = viewOnlyPermissionValue();

  return nextDraft;
}

function countVisiblePermissions(permissions: UserDashboardPermission[]) {
  return permissions.filter((permission) => permission.canView).length;
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
  targetRole,
}: {
  permissions?: UserDashboardPermission[];
  currentUserRole: Role;
  targetRole?: Role;
}) {
  const draft = createEmptyPermissionDraft({
    currentUserRole,
    targetRole,
  });

  if (targetRole === 'SUPER_ADMIN') {
    for (const module of getVisibleModuleOptions(currentUserRole, targetRole)) {
      draft[module.key] = fullPermissionValue();
    }

    return draft;
  }

  const savedMap = new Map(
    (permissions ?? []).map((permission) => [permission.module, permission])
  );

  for (const module of getVisibleModuleOptions(currentUserRole, targetRole)) {
    const saved = savedMap.get(module.key);

    draft[module.key] = {
      canView: Boolean(saved?.canView),
      canCreate: Boolean(saved?.canCreate),
      canEdit: Boolean(saved?.canEdit),
      canDelete: Boolean(saved?.canDelete),
    };
  }

  return forceSafePermissionDraft(draft);
}

function createDefaultPermissionDraftForRole({
  role,
  currentUserRole,
}: {
  role: Role;
  currentUserRole: Role;
}) {
  const draft = createEmptyPermissionDraft({ currentUserRole, targetRole: role });

  function setModule(moduleKey: string, value: PermissionDraft[string]) {
    if (draft[moduleKey]) {
      draft[moduleKey] = value;
    }
  }

  if (role === 'SUPER_ADMIN' || role === 'HOTEL_ADMIN') {
    for (const module of getVisibleModuleOptions(currentUserRole, role)) {
      if (role === 'HOTEL_ADMIN' && module.key === ('HOTELS' as DashboardModule)) {
        continue;
      }

      draft[module.key] = fullPermissionValue();
    }

    return forceSafePermissionDraft(draft);
  }

  if (role === 'KITCHEN') {
    setModule('OVERVIEW', viewOnlyPermissionValue());
    setModule('KITCHEN_DISPLAY', {
      canView: true,
      canCreate: false,
      canEdit: true,
      canDelete: false,
    });
    setModule('INVENTORY', viewOnlyPermissionValue());

    return forceSafePermissionDraft(draft);
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


  setModule('POS_TERMINAL', {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
  });

  setModule('ANALYTICS', viewOnlyPermissionValue());

  return forceSafePermissionDraft(draft);
}

function PermissionMatrix({
  permissions,
  currentUserRole,
  targetRole,
  compact = false,
  permissionDraft,
  onPermissionChange,
}: {
  permissions?: UserDashboardPermission[];
  currentUserRole: Role;
  targetRole?: Role;
  compact?: boolean;
  permissionDraft?: PermissionDraft;
  onPermissionChange?: (
    module: DashboardModule,
    key: PermissionKey,
    checked: boolean
  ) => void;
}) {
  const isControlled = Boolean(permissionDraft && onPermissionChange);

  const visibleModules = getVisibleModuleOptions(currentUserRole, targetRole);

  const [localDraft, setLocalDraft] = useState<PermissionDraft>(() =>
    createPermissionDraftFromSaved({
      permissions,
      currentUserRole,
      targetRole,
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
        targetRole,
      })
    );
  }, [permissions, currentUserRole, targetRole, isControlled]);

  const activeDraft = isControlled ? permissionDraft ?? {} : localDraft;
  const isSuperAdminTarget = targetRole === 'SUPER_ADMIN';

  function getModuleValue(module: DashboardModule) {
    if (isRequiredLandingModule(module)) {
      return {
        ...(activeDraft[module] ?? emptyPermissionValue()),
        canView: true,
      };
    }

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

    if (isRequiredLandingModule(module) && key !== 'canView') {
      nextDraft[module] = viewOnlyPermissionValue();
      applyDraft(forceSafePermissionDraft(nextDraft));
      return;
    }

    if (isRequiredLandingModule(module) && key === 'canView' && !checked) {
      nextDraft[module] = viewOnlyPermissionValue();
      applyDraft(forceSafePermissionDraft(nextDraft));
      return;
    }

    nextDraft[module] = normalizePermissionValue(
      nextDraft[module] ?? emptyPermissionValue(),
      key,
      checked
    );

    applyDraft(forceSafePermissionDraft(nextDraft));
  }

  function setModulePreset(
    module: DashboardModule,
    value: PermissionDraft[string]
  ) {
    const nextDraft = cloneActiveDraft();

    nextDraft[module] = isRequiredLandingModule(module)
      ? viewOnlyPermissionValue()
      : value;

    applyDraft(forceSafePermissionDraft(nextDraft));
  }

  function setAllModules(value: PermissionDraft[string]) {
    const nextDraft = cloneActiveDraft();

    for (const module of visibleModules) {
      nextDraft[module.key] = isRequiredLandingModule(module.key)
        ? viewOnlyPermissionValue()
        : {
            ...value,
          };
    }

    applyDraft(forceSafePermissionDraft(nextDraft));
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

    applyDraft(forceSafePermissionDraft(nextDraft));
  }

  const allSelected = visibleModules.every((module) => {
    const value = getModuleValue(module.key);

    if (isRequiredLandingModule(module.key)) {
      return value.canView;
    }

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
          <p className="mt-1 text-[11px] font-bold text-emerald-700">
            Overview is kept visible as the safe dashboard landing page.
          </p>
        </div>

        {!isSuperAdminTarget ? (
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
        ) : (
          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-700">
            Super Admin accounts always receive full dashboard access.
          </p>
        )}
      </div>

      {!isSuperAdminTarget ? (
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
      ) : null}

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

                {!isSuperAdminTarget ? (
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
                    disabled={isRequiredLandingModule(module.key)}
                    className="h-8 rounded-xl border border-red-200 bg-red-50 px-3 text-[11px] font-black text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {permissionColumns.map((column) => {
                  const isRequiredModule = isRequiredLandingModule(module.key);
                  const checked = isSuperAdminTarget
                    ? true
                    : isRequiredModule
                      ? column.key === 'canView'
                      : Boolean(value[column.key]);
                  const disabled = isRequiredModule || isSuperAdminTarget;

                  return (
                    <label
                      key={`${module.key}-${column.key}`}
                      className={
                        disabled
                          ? 'flex cursor-not-allowed items-center justify-between rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2 text-xs font-black text-neutral-400'
                          : 'flex cursor-pointer items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-black text-neutral-700 transition hover:border-neutral-400 hover:bg-white'
                      }
                    >
                      <span>{column.label}</span>

                      <input
                        type="checkbox"
                        name={`permission:${module.key}:${column.key}`}
                        checked={checked}
                        disabled={disabled}
                        onChange={(event) => {
                          updatePermission(
                            module.key,
                            column.key,
                            event.target.checked
                          );
                        }}
                        className="size-4 cursor-pointer rounded border-neutral-300 accent-black disabled:cursor-not-allowed"
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
    <DashboardToastViewport>
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
    </DashboardToastViewport>
  );
}

function SubmitButton({
  children,
  danger,
}: {
  children: string;
  danger?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        danger
          ? 'h-11 rounded-2xl bg-red-600 px-5 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60'
          : 'h-11 rounded-2xl bg-black px-5 text-sm font-black text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60'
      }
    >
      {pending ? 'Please wait…' : children}
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 px-3 py-3 sm:items-center sm:px-4 sm:py-6">
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[calc(100dvh-1.5rem)] w-full ${widthClass} flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:rounded-[2rem]`}
      >
        <div className="shrink-0 border-b border-neutral-100 bg-white px-4 py-4 sm:px-6 sm:py-5">
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

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
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
        permissions: forceSafePermissionDraft({
          ...current.permissions,
          [module]: nextModule,
        }),
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
              placeholder="At least 8 characters"
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Use at least 8 characters and share it securely with the user.
            </p>
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
              value={draft.confirmPassword}
              onChange={(event) =>
                updateDraft('confirmPassword', event.target.value)
              }
              placeholder="Re-enter temporary password"
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              User Role
            </label>
            <select
              name="role"
              value={draft.role}
              onChange={(event) => updateRole(event.target.value as Role)}
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100"
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
                  {hotel.name}{!hotel.isActive ? ' (Inactive)' : ''}
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
          targetRole={draft.role}
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
  isCurrentUser,
  onClose,
  onToast,
}: {
  account: UserAccount;
  hotels: HotelOption[];
  allowedRoles: Role[];
  currentUserRole: Role;
  isCurrentUser: boolean;
  onClose: () => void;
  onToast: (message: ToastMessage) => void;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    updateUserAccountAction,
    initialState
  );
  const [role, setRole] = useState<Role>(account.role);
  const [hotelId, setHotelId] = useState(account.hotelId ?? '');
  const [permissionDraft, setPermissionDraft] = useState<PermissionDraft>(() =>
    createPermissionDraftFromSaved({
      permissions: account.dashboardPermissions,
      currentUserRole,
      targetRole: account.role,
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

  function updateRole(nextRole: Role) {
    setRole(nextRole);
    setHotelId((currentHotelId) =>
      nextRole === 'SUPER_ADMIN' ? '' : currentHotelId || hotels[0]?.id || ''
    );
    setPermissionDraft(
      createDefaultPermissionDraftForRole({
        role: nextRole,
        currentUserRole,
      })
    );
  }

  function updatePermission(
    module: DashboardModule,
    key: PermissionKey,
    checked: boolean
  ) {
    setPermissionDraft((current) => {
      const currentModule = current[module] ?? emptyPermissionValue();
      const nextModule = normalizePermissionValue(currentModule, key, checked);

      return forceSafePermissionDraft({
        ...current,
        [module]: nextModule,
      });
    });
  }

  return (
    <Modal title="Edit User Account" onClose={onClose} size="wide">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="userId" value={account.id} />

        <StateMessage state={state} />

        <div className="grid gap-4 md:grid-cols-2">
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
            {isCurrentUser ? (
              <input type="hidden" name="role" value={role} />
            ) : null}
            <select
              name={isCurrentUser ? undefined : 'role'}
              value={role}
              disabled={isCurrentUser}
              onChange={(event) => updateRole(event.target.value as Role)}
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100"
            >
              {allowedRoles.map((allowedRole) => (
                <option key={allowedRole} value={allowedRole}>
                  {roleLabels[allowedRole]}
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
              value={hotelId}
              onChange={(event) => setHotelId(event.target.value)}
              disabled={currentUserRole !== 'SUPER_ADMIN' || role === 'SUPER_ADMIN'}
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100"
            >
              {currentUserRole === 'SUPER_ADMIN' ? (
                <option value="">No hotel / Super Admin</option>
              ) : null}

              {hotels.map((hotel) => (
                <option key={hotel.id} value={hotel.id}>
                  {hotel.name}{!hotel.isActive ? ' (Inactive)' : ''}
                </option>
              ))}
            </select>

            {role !== 'SUPER_ADMIN' && !hotelId ? (
              <p className="mt-1 text-xs font-bold text-red-600">
                Please select a hotel for this role.
              </p>
            ) : null}
          </div>
        </div>

        <PermissionMatrix
          permissions={account.dashboardPermissions}
          currentUserRole={currentUserRole}
          targetRole={role}
          compact
          permissionDraft={permissionDraft}
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
            placeholder="At least 8 characters"
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
          Use at least 8 characters. Share the temporary password securely and
          ask the user to replace it after signing in.
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

function AccountStatusModal({
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
    setUserActiveStateAction,
    initialState
  );
  const nextIsActive = !account.isActive;

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
    <Modal
      title={nextIsActive ? 'Activate User Account' : 'Deactivate User Account'}
      onClose={onClose}
    >
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="userId" value={account.id} />
        <input
          type="hidden"
          name="isActive"
          value={nextIsActive ? 'true' : 'false'}
        />

        <StateMessage state={state} />

        <div
          className={
            nextIsActive
              ? 'rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800'
              : 'rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800'
          }
        >
          <p className="font-black">
            {nextIsActive
              ? 'This user will be allowed to sign in again.'
              : 'This user will immediately lose dashboard access.'}
          </p>
          <p className="mt-1">
            <strong>{account.name}</strong> ({account.email})
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
          <SubmitButton danger={!nextIsActive}>
            {nextIsActive ? 'Activate Account' : 'Deactivate Account'}
          </SubmitButton>
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
  currentUserId,
}: {
  users: UserAccount[];
  hotels: HotelOption[];
  allowedRoles: Role[];
  currentUserRole: Role;
  currentUserId: string;
}) {
  const [toast, setToast] = useState<ToastMessage>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | Role>('ALL');
  const [hotelFilter, setHotelFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'ACTIVE' | 'INACTIVE'
  >('ALL');

  const [creatingUser, setCreatingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [resetPasswordUser, setResetPasswordUser] =
    useState<UserAccount | null>(null);
  const [statusUser, setStatusUser] = useState<UserAccount | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserAccount | null>(null);

  const clearToast = useCallback(() => setToast(null), []);
  const closeCreateUser = useCallback(() => setCreatingUser(false), []);
  const closeEditUser = useCallback(() => setEditingUser(null), []);
  const closeResetPassword = useCallback(
    () => setResetPasswordUser(null),
    []
  );
  const closeStatusUser = useCallback(() => setStatusUser(null), []);
  const closeDeleteUser = useCallback(() => setDeletingUser(null), []);

  const filteredUsers = users.filter((account) => {
    const searchable = [
      account.name,
      account.email,
      account.role,
      account.hotel?.name ?? 'No hotel assigned',
      account.isActive ? 'active' : 'inactive',
    ]
      .join(' ')
      .toLowerCase();

    const matchesSearch = searchable.includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || account.role === roleFilter;
    const matchesHotel =
      hotelFilter === 'ALL' ||
      (hotelFilter === 'NONE' && !account.hotelId) ||
      account.hotelId === hotelFilter;
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && account.isActive) ||
      (statusFilter === 'INACTIVE' && !account.isActive);

    return matchesSearch && matchesRole && matchesHotel && matchesStatus;
  });

  const adminCount = users.filter(
    (account) =>
      account.role === 'SUPER_ADMIN' || account.role === 'HOTEL_ADMIN'
  ).length;
  const activeCount = users.filter((account) => account.isActive).length;
  const inactiveCount = users.length - activeCount;
  const zeroAccessCount = users.filter(
    (account) =>
      account.isActive &&
      account.role !== 'SUPER_ADMIN' &&
      countVisiblePermissions(account.dashboardPermissions) <= 0
  ).length;

  return (
    <>
      <Toast message={toast} onClose={clearToast} />

      <div className="space-y-5">
        <section className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-[#11100b] text-white shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
          <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="inline-flex rounded-full border border-[#c99c38]/30 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#f1c66a]">
                Access Control
              </p>
              <h1 className="mt-3 text-2xl font-black tracking-tight">
                User Account Settings
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/60">
                Create accounts, assign hotel access, and control exactly which
                dashboard modules each user can open.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setCreatingUser(true)}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#d6a738] px-5 text-sm font-black text-black shadow-[0_14px_35px_rgba(214,167,56,0.25)] transition hover:bg-[#f1c66a]"
            >
              Create New User
            </button>
          </div>

          <div className="grid border-t border-white/10 bg-black/20 sm:grid-cols-4">
            <div className="border-b border-white/10 p-4 sm:border-b-0 sm:border-r">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d6a738]">
                Users
              </p>
              <p className="mt-1 text-2xl font-black">{users.length}</p>
              <p className="mt-1 text-xs font-semibold text-white/45">
                Total accounts
              </p>
            </div>

            <div className="border-b border-white/10 p-4 sm:border-b-0 sm:border-r">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d6a738]">
                Admins
              </p>
              <p className="mt-1 text-2xl font-black">{adminCount}</p>
              <p className="mt-1 text-xs font-semibold text-white/45">
                Admin-level accounts
              </p>
            </div>

            <div className="border-b border-white/10 p-4 sm:border-b-0 sm:border-r">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d6a738]">
                Active
              </p>
              <p className="mt-1 text-2xl font-black">{activeCount}</p>
              <p className="mt-1 text-xs font-semibold text-white/45">
                Accounts allowed to sign in
              </p>
            </div>

            <div className="p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d6a738]">
                Needs Review
              </p>
              <p className="mt-1 text-2xl font-black">{zeroAccessCount}</p>
              <p className="mt-1 text-xs font-semibold text-white/45">
                Active accounts with no saved access · {inactiveCount} inactive
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_170px_210px_170px]">
            <label className="grid gap-1">
              <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
                Search Users
              </span>
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search name, email, role, or hotel..."
                className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
                Role
              </span>
              <select
                value={roleFilter}
                onChange={(event) =>
                  setRoleFilter(event.target.value as 'ALL' | Role)
                }
                className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10"
              >
                <option value="ALL">All Roles</option>
                {allowedRoles.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
                Hotel
              </span>
              <select
                value={hotelFilter}
                onChange={(event) => setHotelFilter(event.target.value)}
                className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10"
              >
                <option value="ALL">All Hotels</option>
                <option value="NONE">No Hotel Assigned</option>
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name}{!hotel.isActive ? ' (Inactive)' : ''}
                  </option>
                ))}
              </select>
            </label>


            <label className="grid gap-1">
              <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
                Status
              </span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE'
                  )
                }
                className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
          </div>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-neutral-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black">User Directory</h2>
              <p className="text-sm font-semibold text-neutral-500">
                Showing {filteredUsers.length} of {users.length} accounts.
                Overview is always kept visible as a safe login landing page.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-5 py-3 text-xs font-black uppercase tracking-wide text-neutral-500">
                    User
                  </th>
                  <th className="px-5 py-3 text-xs font-black uppercase tracking-wide text-neutral-500">
                    Role
                  </th>
                  <th className="px-5 py-3 text-xs font-black uppercase tracking-wide text-neutral-500">
                    Hotel
                  </th>
                  <th className="px-5 py-3 text-xs font-black uppercase tracking-wide text-neutral-500">
                    Status
                  </th>
                  <th className="px-5 py-3 text-xs font-black uppercase tracking-wide text-neutral-500">
                    Access
                  </th>
                  <th className="px-5 py-3 text-xs font-black uppercase tracking-wide text-neutral-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map((account) => {
                  const visibleModules = countVisiblePermissions(
                    account.dashboardPermissions
                  );
                  const hasOverview = account.dashboardPermissions.some(
                    (permission) =>
                      permission.module === ('OVERVIEW' as DashboardModule) &&
                      permission.canView
                  );

                  return (
                    <tr key={account.id} className="border-t border-neutral-100">
                      <td className="px-5 py-4">
                        <p className="font-black text-[#11100b]">
                          {account.name}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-neutral-500">
                          {account.email}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full bg-[#fff8e7] px-3 py-1 text-xs font-black text-[#9a6b18]">
                          {roleLabels[account.role]}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-sm font-bold text-neutral-700">
                        {account.hotel?.name ?? 'No hotel assigned'}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={
                            account.isActive
                              ? 'inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700'
                              : 'inline-flex rounded-full bg-neutral-200 px-3 py-1 text-xs font-black text-neutral-600'
                          }
                        >
                          {account.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <p className="text-sm font-black text-[#11100b]">
                          {visibleModules} visible modules
                        </p>
                        <p
                          className={
                            hasOverview
                              ? 'mt-1 text-xs font-bold text-emerald-700'
                              : 'mt-1 text-xs font-bold text-red-600'
                          }
                        >
                          {hasOverview
                            ? 'Safe landing enabled'
                            : 'Needs save to repair landing'}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingUser(account)}
                            className="h-9 rounded-xl border border-neutral-200 px-3 text-xs font-black hover:bg-neutral-50"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => setResetPasswordUser(account)}
                            className="h-9 rounded-xl bg-black px-3 text-xs font-black text-white hover:bg-neutral-800"
                          >
                            Reset Password
                          </button>

                          {account.id !== currentUserId || !account.isActive ? (
                            <button
                              type="button"
                              onClick={() => setStatusUser(account)}
                              className={
                                account.isActive
                                  ? 'h-9 rounded-xl bg-amber-500 px-3 text-xs font-black text-black hover:bg-amber-400'
                                  : 'h-9 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700'
                              }
                            >
                              {account.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          ) : null}

                          {!account.isActive && account.id !== currentUserId ? (
                            <button
                              type="button"
                              onClick={() => setDeletingUser(account)}
                              className="h-9 rounded-xl bg-red-600 px-3 text-xs font-black text-white hover:bg-red-700"
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!filteredUsers.length ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-10 text-center text-sm font-bold text-neutral-500"
                    >
                      No users match your current filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {creatingUser ? (
        <CreateUserModal
          hotels={hotels}
          allowedRoles={allowedRoles}
          currentUserRole={currentUserRole}
          onClose={closeCreateUser}
          onToast={setToast}
        />
      ) : null}

      {editingUser ? (
        <EditUserModal
          account={editingUser}
          hotels={hotels}
          allowedRoles={allowedRoles}
          currentUserRole={currentUserRole}
          isCurrentUser={editingUser.id === currentUserId}
          onClose={closeEditUser}
          onToast={setToast}
        />
      ) : null}

      {resetPasswordUser ? (
        <ResetPasswordModal
          account={resetPasswordUser}
          onClose={closeResetPassword}
          onToast={setToast}
        />
      ) : null}

      {statusUser ? (
        <AccountStatusModal
          account={statusUser}
          onClose={closeStatusUser}
          onToast={setToast}
        />
      ) : null}

      {deletingUser ? (
        <DeleteUserModal
          account={deletingUser}
          onClose={closeDeleteUser}
          onToast={setToast}
        />
      ) : null}
    </>
  );
}
