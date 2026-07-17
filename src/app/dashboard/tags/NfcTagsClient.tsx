'use client';
import { useRouter } from 'next/navigation';
import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Copy,
  ExternalLink,
  Hotel,
  Link2,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import {
  createTagAction,
  deleteTagAction,
  rotateTagSecretAction,
  toggleTagStatusAction,
  updateTagAction,
} from './actions';

type HotelOption = {
  id: string;
  name: string;
};

type RoomOption = {
  id: string;
  hotelId: string;
  hotelName: string;
  number: string;
  name: string;
};

type LocationOption = {
  id: string;
  hotelId: string;
  hotelName: string;
  name: string;
};

type NfcTagItem = {
  id: string;
  hotelId: string;
  roomId: string | null;
  locationId: string | null;
  hotelName: string;
  label: string;
  code: string;
  tagType: string;
  status: string;
  linkedDestination: string;
  roomNumber: string;
  locationName: string;
  lastScannedAt: string | null;
  createdAt: string;
  secureLaunchUrl: string;
  lockedDestinationUrl: string;
};

type NfcConfirmAction = 'rotate' | 'delete';

type NfcConfirmDialog = {
  action: NfcConfirmAction;
  tag: NfcTagItem;
  title: string;
  description: string;
  confirmLabel: string;
};



type ClientFormAction = (formData: FormData) => void | Promise<void>;

const TAG_CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const TAG_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TAG_CODE_LENGTH = 8;

function FormField({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-black text-neutral-800">{label}</span>
      {children}
      {helper ? (
        <span className="text-xs font-medium leading-relaxed text-neutral-500">
          {helper}
        </span>
      ) : null}
    </label>
  );
}

function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 px-3 py-3 sm:items-center sm:px-4 sm:py-6">
      <div role="dialog" aria-modal="true" className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:rounded-[2rem]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-100 bg-white p-4 sm:gap-4 sm:p-5">
          <div className="min-w-0">
            <h2 className="text-2xl font-black">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm leading-6 text-neutral-500">
                {description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-neutral-100 hover:bg-neutral-200"
            aria-label="Close modal"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Never scanned';
  }

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function successMessage(success?: string) {
  const messages: Record<string, string> = {
    'tag-created': 'NFC tag successfully added.',
    'tag-updated': 'NFC tag successfully updated.',
    'tag-deleted': 'NFC tag successfully deleted.',
    'tag-rotated':
      'NFC tag secret successfully rotated. Old shared links are now invalid.',
  };

  return success ? messages[success] : null;
}

function getActionErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

function getRandomIndex(length: number) {
  if (typeof window !== 'undefined' && window.crypto) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);

    return values[0] % length;
  }

  return Math.floor(Math.random() * length);
}

function generateShortTagCode() {
  let code = TAG_CODE_LETTERS[getRandomIndex(TAG_CODE_LETTERS.length)];

  for (let index = 1; index < TAG_CODE_LENGTH; index += 1) {
    code += TAG_CODE_ALPHABET[getRandomIndex(TAG_CODE_ALPHABET.length)];
  }

  return code;
}

function getUniqueShortTagCode(
  existingCodes: string[],
  currentCodeToIgnore?: string
) {
  const ignoredCode = currentCodeToIgnore?.trim().toUpperCase() ?? '';

  const existing = new Set(
    existingCodes
      .map((code) => code.trim().toUpperCase())
      .filter((code) => Boolean(code) && code !== ignoredCode)
  );

  let nextCode = generateShortTagCode();
  let attempts = 0;

  while (existing.has(nextCode) && attempts < 80) {
    nextCode = generateShortTagCode();
    attempts += 1;
  }

  return nextCode;
}

function buildAutoLabel({
  tagType,
  room,
  location,
}: {
  tagType: string;
  room?: RoomOption;
  location?: LocationOption;
}) {
  if (tagType === 'ROOM' && room?.number) {
    return room.name
      ? `Room ${room.number} ${room.name}`
      : `Room ${room.number}`;
  }

  if (tagType !== 'ROOM' && location?.name) {
    return location.name;
  }

  return '';
}

type SessionModeInfo = {
  mode: 'PRIVATE_ROOM' | 'PUBLIC_LOCATION';
  label: string;
  description: string;
  containerClass: string;
  iconClass: string;
};

function getSessionModeInfo(tag: {
  tagType: string;
  roomId?: string | null;
  locationId?: string | null;
}): SessionModeInfo {
  const isPrivateRoom =
    tag.tagType === 'ROOM' && Boolean(tag.roomId) && !tag.locationId;

  if (isPrivateRoom) {
    return {
      mode: 'PRIVATE_ROOM',
      label: 'Private Room Session',
      description:
        'Best for room panels. Pending guest orders or service requests may be reused for the same room session.',
      containerClass: 'border-blue-200 bg-blue-50 text-blue-900',
      iconClass: 'bg-blue-100 text-blue-700',
    };
  }

  return {
    mode: 'PUBLIC_LOCATION',
    label: 'Public Multi-Device',
    description:
      'Unlimited guests/devices may tap this NFC tag. Each device receives a separate guest session.',
    containerClass: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    iconClass: 'bg-emerald-100 text-emerald-700',
  };
}

function SessionModePreview({
  tagType,
  roomId,
  locationId,
}: {
  tagType: string;
  roomId?: string | null;
  locationId?: string | null;
}) {
  const sessionMode = getSessionModeInfo({
    tagType,
    roomId,
    locationId,
  });

  const Icon =
    sessionMode.mode === 'PRIVATE_ROOM' ? ShieldCheck : UsersRound;

  return (
    <div
      className={`rounded-2xl border p-4 text-sm ${sessionMode.containerClass}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-2xl ${sessionMode.iconClass}`}
        >
          <Icon className="size-5" />
        </span>

        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] opacity-70">
            Session Mode
          </p>

          <p className="mt-1 text-base font-black">{sessionMode.label}</p>

          <p className="mt-1 text-xs font-bold leading-5 opacity-75">
            {sessionMode.description}
          </p>
        </div>
      </div>
    </div>
  );
}

function NfcMetricCard({
  icon,
  label,
  value,
  helper,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  helper: string;
  tone?: 'green' | 'amber' | 'blue' | 'red' | 'neutral';
}) {
  const className =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : tone === 'blue'
          ? 'border-blue-200 bg-blue-50 text-blue-900'
          : tone === 'red'
            ? 'border-red-200 bg-red-50 text-red-900'
            : 'border-neutral-200 bg-neutral-50 text-neutral-900';

  const iconClassName =
    tone === 'green'
      ? 'bg-emerald-100 text-emerald-700'
      : tone === 'amber'
        ? 'bg-amber-100 text-amber-700'
        : tone === 'blue'
          ? 'bg-blue-100 text-blue-700'
          : tone === 'red'
            ? 'bg-red-100 text-red-700'
            : 'bg-white text-[#b88938]';

  return (
    <div className={`rounded-[1.75rem] border p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide opacity-70">
            {label}
          </p>

          <p className="mt-2 text-3xl font-black">{value}</p>

          <p className="mt-1 text-xs font-bold opacity-70">{helper}</p>
        </div>

        <span
          className={`grid size-11 shrink-0 place-items-center rounded-2xl ${iconClassName}`}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}

function NfcActionConfirmDialog({
  dialog,
  onCancel,
  onConfirm,
}: {
  dialog: NfcConfirmDialog | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!dialog) {
    return null;
  }

  const isDelete = dialog.action === 'delete';

  return (
    <div className="fixed inset-0 z-[140] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/55 px-3 py-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div role="alertdialog" aria-modal="true" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-[1.5rem] border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950 sm:max-h-[calc(100dvh-2rem)] sm:rounded-[2rem]">
        <div
          className={
            isDelete
              ? 'border-b border-red-100 bg-red-50 p-4 dark:border-red-500/20 sm:p-6 dark:bg-red-500/10'
              : 'border-b border-amber-100 bg-amber-50 p-4 dark:border-amber-500/20 sm:p-6 dark:bg-amber-500/10'
          }
        >
          <div className="flex items-start gap-4">
            <div
              className={
                isDelete
                  ? 'grid size-12 shrink-0 place-items-center rounded-2xl bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200'
                  : 'grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'
              }
            >
              {isDelete ? (
                <Trash2 className="size-5" />
              ) : (
                <RotateCcw className="size-5" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xl font-black text-neutral-950 dark:text-white">
                {dialog.title}
              </p>

              <p className="mt-2 text-sm font-semibold leading-6 text-neutral-600 dark:text-neutral-400">
                {dialog.description}
              </p>
            </div>

            <button
              type="button"
              onClick={onCancel}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-white/70 text-neutral-500 transition hover:bg-white dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800"
              aria-label="Close confirmation"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-400">
              NFC Tag
            </p>

            <p className="mt-2 truncate text-lg font-black text-neutral-950 dark:text-white">
              {dialog.tag.label}
            </p>

            <p className="mt-1 truncate text-sm font-bold text-neutral-500 dark:text-neutral-400">
              {dialog.tag.code} · {dialog.tag.hotelName}
            </p>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-11 rounded-2xl border border-neutral-200 bg-white text-sm font-black text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white dark:hover:bg-neutral-900"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onConfirm}
              className={
                isDelete
                  ? 'h-11 rounded-2xl bg-red-600 text-sm font-black text-white transition hover:bg-red-700'
                  : 'h-11 rounded-2xl bg-amber-500 text-sm font-black text-white transition hover:bg-amber-600'
              }
            >
              {dialog.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyButton({
  value,
  label = 'Copy',
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copyValue}
      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 text-[11px] font-black text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white dark:hover:bg-neutral-900"
    >
      <Copy className="size-3.5" />
      {copied ? 'Copied' : label}
    </button>
  );
}

function NfcUrlBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="truncate text-[9px] font-black uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
          {label}
        </p>

        <div className="flex shrink-0 gap-1.5">
          <CopyButton value={value} label="Copy" />

          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-black px-2.5 text-[11px] font-black text-white transition hover:bg-neutral-800 dark:bg-gold dark:text-black dark:hover:bg-gold/80"
          >
            <ExternalLink className="size-3" />
            Open
          </a>
        </div>
      </div>

      <p className="truncate text-[11px] font-bold leading-4 text-blue-700 dark:text-blue-300">
        {value}
      </p>
    </div>
  );
}

function getAssignmentLabel(tag: NfcTagItem) {
  if (tag.roomNumber) {
    return `Room ${tag.roomNumber}`;
  }

  if (tag.locationName) {
    return tag.locationName;
  }

  return tag.linkedDestination || 'Unassigned';
}

function getStatusTone(status: string) {
  return status === 'ACTIVE' ? 'green' : 'neutral';
}

function GeneratedCodeInput({
  code,
  helper,
  onRegenerate,
}: {
  code: string;
  helper: string;
  onRegenerate: () => void;
}) {
  return (
    <FormField label="Generated Unique Tag ID" helper={helper}>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          name="code"
          value={code}
          readOnly
          required
          className="bg-neutral-50 font-black uppercase tracking-[0.18em] text-neutral-700"
        />

        <button
          type="button"
          onClick={onRegenerate}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-neutral-200 px-4 text-sm font-black hover:bg-neutral-50"
        >
          <RefreshCw className="size-4" />
          Regenerate
        </button>
      </div>
    </FormField>
  );
}

function CreateTagForm({
  hotels,
  rooms,
  locations,
  tagTypes,
  canChangeHotel,
  currentHotelId,
  existingCodes,
  action,
}: {
  hotels: HotelOption[];
  rooms: RoomOption[];
  locations: LocationOption[];
  tagTypes: string[];
  canChangeHotel: boolean;
  currentHotelId: string;
  existingCodes: string[];
  action: ClientFormAction;
}) {

  const defaultTagType = tagTypes.includes('ROOM') ? 'ROOM' : tagTypes[0] ?? '';

  const [selectedHotelId, setSelectedHotelId] = useState(currentHotelId);
  const [tagType, setTagType] = useState(defaultTagType);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [label, setLabel] = useState('');
  const [generatedCode, setGeneratedCode] = useState(() =>
    getUniqueShortTagCode(existingCodes)
  );

  const filteredRooms = useMemo(
    () => rooms.filter((room) => room.hotelId === selectedHotelId),
    [rooms, selectedHotelId]
  );

  const filteredLocations = useMemo(
    () => locations.filter((location) => location.hotelId === selectedHotelId),
    [locations, selectedHotelId]
  );

  const selectedRoom = filteredRooms.find((room) => room.id === selectedRoomId);

  const selectedLocation = filteredLocations.find(
    (location) => location.id === selectedLocationId
  );


  

  function regenerateCode() {
    setGeneratedCode(getUniqueShortTagCode(existingCodes));
  }

  function handleHotelChange(value: string) {
    setSelectedHotelId(value);
    setSelectedRoomId('');
    setSelectedLocationId('');
    setLabel('');
    setGeneratedCode(getUniqueShortTagCode(existingCodes));
  }

  function handleTagTypeChange(value: string) {
    setTagType(value);
    setSelectedRoomId('');
    setSelectedLocationId('');
    setLabel('');
    setGeneratedCode(getUniqueShortTagCode(existingCodes));
  }

  function handleRoomChange(value: string) {
    setSelectedRoomId(value);
    setSelectedLocationId('');
    setGeneratedCode(getUniqueShortTagCode(existingCodes));

    const room = filteredRooms.find((item) => item.id === value);

    if (room) {
      setLabel(
        room.name ? `Room ${room.number} ${room.name}` : `Room ${room.number}`
      );
    }
  }

  
  function handleLocationChange(value: string) {
    setSelectedLocationId(value);
    setSelectedRoomId('');
    setGeneratedCode(getUniqueShortTagCode(existingCodes));

    const location = filteredLocations.find((item) => item.id === value);

    if (location) {
      setLabel(location.name);
    }
  }

  useEffect(() => {
    const autoLabel = buildAutoLabel({
      tagType,
      room: selectedRoom,
      location: selectedLocation,
    });

    if (autoLabel && !label.trim()) {
      setLabel(autoLabel);
    }
  }, [label, selectedLocation, selectedRoom, tagType]);

  return (
    <form action={action} className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {canChangeHotel ? (
        <FormField
          label="Hotel / Property"
          helper="Select which hotel this NFC tag belongs to."
        >
          <Select
            name="hotelId"
            value={selectedHotelId}
            onChange={(event) => handleHotelChange(event.target.value)}
            required
          >
            {hotels.map((hotel) => (
              <option key={hotel.id} value={hotel.id}>
                {hotel.name}
              </option>
            ))}
          </Select>
        </FormField>
      ) : (
        <input type="hidden" name="hotelId" value={currentHotelId} />
      )}

      <FormField
        label="NFC Name"
        helper="Friendly staff label. Example: Room 305 Main Panel."
      >
        <Input
          name="label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Room 305 Main Panel"
          required
        />
      </FormField>

      <GeneratedCodeInput
        code={generatedCode}
        onRegenerate={regenerateCode}
        helper="Automatically generated secure short code. Example: A24FGSGH."
      />

      <FormField label="Tag Type" helper="Choose where the NFC panel is placed.">
        <Select
          name="tagType"
          value={tagType}
          onChange={(event) => handleTagTypeChange(event.target.value)}
          required
        >
          {tagTypes.map((item) => (
            <option key={item} value={item}>
              {item.replaceAll('_', ' ')}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Assigned Room" helper="Use this for room panels.">
        <Select
          name="roomId"
          value={selectedRoomId}
          onChange={(event) => handleRoomChange(event.target.value)}
          disabled={tagType !== 'ROOM'}
        >
          <option value="">No room</option>
          {filteredRooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.hotelName} · Room {room.number}
              {room.name ? ` - ${room.name}` : ''}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label="Assigned Location"
        helper="Use this for pool, lobby, restaurant, or amenity panels."
      >
        <Select
          name="locationId"
          value={selectedLocationId}
          onChange={(event) => handleLocationChange(event.target.value)}
          disabled={tagType === 'ROOM'}
        >
          <option value="">No location</option>
          {filteredLocations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.hotelName} · {location.name}
            </option>
          ))}
        </Select>
      </FormField>
      <div className="md:col-span-2 xl:col-span-3">
      <SessionModePreview
        tagType={tagType}
        roomId={selectedRoomId || null}
        locationId={selectedLocationId || null}
      />
    </div>

      <div className="md:col-span-2 xl:col-span-3">
        <Button className="w-full md:w-auto">Create Secure NFC Tag</Button>
      </div>
    </form>
  );
}

function EditTagForm({
  tag,
  rooms,
  locations,
  tagTypes,
  tagStatuses,
  existingCodes,
  action,
}: {
  tag: NfcTagItem;
  rooms: RoomOption[];
  locations: LocationOption[];
  tagTypes: string[];
  tagStatuses: string[];
  existingCodes: string[];
  action: ClientFormAction;
}) {
  const [tagType, setTagType] = useState(tag.tagType);
  const [roomId, setRoomId] = useState(tag.roomId ?? '');
  const [locationId, setLocationId] = useState(tag.locationId ?? '');
  const [code, setCode] = useState(tag.code.toUpperCase());

  const availableRooms = useMemo(
    () => rooms.filter((room) => room.hotelId === tag.hotelId),
    [rooms, tag.hotelId]
  );

  const availableLocations = useMemo(
    () => locations.filter((location) => location.hotelId === tag.hotelId),
    [locations, tag.hotelId]
  );

  function regenerateCode() {
    setCode(getUniqueShortTagCode(existingCodes, tag.code));
  }

  function handleTagTypeChange(value: string) {
    setTagType(value);

    if (value === 'ROOM') {
      setLocationId('');
    } else {
      setRoomId('');
    }
  }

  return (
    <form action={action} className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <input type="hidden" name="tagId" value={tag.id} />
      <input type="hidden" name="hotelId" value={tag.hotelId} />

      <FormField label="NFC Name">
        <Input name="label" defaultValue={tag.label} required />
      </FormField>

      <GeneratedCodeInput
        code={code}
        onRegenerate={regenerateCode}
        helper="Click Regenerate to update this tag ID. Reprint or rewrite the NFC card after saving."
      />

      <FormField label="Status">
        <Select name="status" defaultValue={tag.status} required>
          {tagStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Tag Type">
        <Select
          name="tagType"
          value={tagType}
          onChange={(event) => handleTagTypeChange(event.target.value)}
          required
        >
          {tagTypes.map((item) => (
            <option key={item} value={item}>
              {item.replaceAll('_', ' ')}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Assigned Room">
        <Select
          name="roomId"
          value={roomId}
          onChange={(event) => setRoomId(event.target.value)}
          disabled={tagType !== 'ROOM'}
        >
          <option value="">No room</option>
          {availableRooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.hotelName} · Room {room.number}
              {room.name ? ` - ${room.name}` : ''}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Assigned Location">
        <Select
          name="locationId"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
          disabled={tagType === 'ROOM'}
        >
          <option value="">No location</option>
          {availableLocations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.hotelName} · {location.name}
            </option>
          ))}
        </Select>
      </FormField>
      <div className="md:col-span-2 xl:col-span-3">
      <SessionModePreview
        tagType={tagType}
        roomId={roomId || null}
        locationId={locationId || null}
      />
    </div>

      <div className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800 md:col-span-2 xl:col-span-3">
        Updating the Unique Tag ID changes the NFC guest URL. After saving,
        reprint the QR/NFC launch link or rewrite the physical NFC card.
      </div>

      <div className="md:col-span-2 xl:col-span-3">
        <Button className="w-full md:w-auto">Save NFC Tag Changes</Button>
      </div>
    </form>
  );
}

export function NfcTagsClient({
  success,
  canChangeHotel,
  currentHotelId,
  hotels,
  rooms,
  locations,
  tags,
  tagTypes,
  tagStatuses,
}: {
  success?: string;
  canChangeHotel: boolean;
  currentHotelId: string;
  hotels: HotelOption[];
  rooms: RoomOption[];
  locations: LocationOption[];
  tags: NfcTagItem[];
  tagTypes: string[];
  tagStatuses: string[];
}) {

 const [toast, setToast] = useState<{
  type: 'success' | 'error';
  message: string;
} | null>(null);

const router = useRouter();

const [creating, setCreating] = useState(false);
const [editingTag, setEditingTag] = useState<NfcTagItem | null>(null);

const [localTags, setLocalTags] = useState<NfcTagItem[]>(tags);
const [actionMessage, setActionMessage] = useState('');
const [actionError, setActionError] = useState('');
const [pendingTagAction, setPendingTagAction] = useState<string | null>(null);
const [isMutating, setIsMutating] = useState(false);
const [confirmDialog, setConfirmDialog] =
  useState<NfcConfirmDialog | null>(null);
const [search, setSearch] = useState('');
const [hotelFilter, setHotelFilter] = useState('ALL');
const [typeFilter, setTypeFilter] = useState('ALL');
const [statusFilter, setStatusFilter] = useState('ALL');

useEffect(() => {
  setLocalTags(tags);
}, [tags]);

useEffect(() => {
  const urlSuccessMessage = successMessage(success);

  if (!urlSuccessMessage) {
    return;
  }

  setToast({
    type: 'success',
    message: urlSuccessMessage,
  });

  const url = new URL(window.location.href);
  url.searchParams.delete('success');

  window.history.replaceState(
    null,
    '',
    `${url.pathname}${url.search}${url.hash}`
  );
}, [success]);

useEffect(() => {
  if (!actionMessage) {
    return;
  }

  setToast({
    type: 'success',
    message: actionMessage,
  });
}, [actionMessage]);

useEffect(() => {
  if (!actionError) {
    return;
  }

  setToast({
    type: 'error',
    message: actionError,
  });
}, [actionError]);

useEffect(() => {
  if (!toast) {
    return;
  }

  const timeout = window.setTimeout(() => {
    setToast(null);
  }, 3500);

  return () => window.clearTimeout(timeout);
}, [toast]);



const filteredTags = useMemo(() => {
  const searchText = search.trim().toLowerCase();

  return localTags.filter((tag) => {
    const matchesSearch =
      !searchText ||
      tag.label.toLowerCase().includes(searchText) ||
      tag.code.toLowerCase().includes(searchText) ||
      tag.hotelName.toLowerCase().includes(searchText) ||
      tag.linkedDestination.toLowerCase().includes(searchText);

    const matchesHotel =
      hotelFilter === 'ALL' || tag.hotelId === hotelFilter;

    const matchesType = typeFilter === 'ALL' || tag.tagType === typeFilter;

    const matchesStatus =
      statusFilter === 'ALL' || tag.status === statusFilter;

    return matchesSearch && matchesHotel && matchesType && matchesStatus;
  });
}, [hotelFilter, search, statusFilter, localTags, typeFilter]);

const activeTagCount = localTags.filter(
  (tag) => tag.status === 'ACTIVE'
).length;

const inactiveTagCount = localTags.length - activeTagCount;

const roomTagCount = localTags.filter((tag) => tag.tagType === 'ROOM').length;
const publicTagCount = localTags.length - roomTagCount;

const neverScannedCount = localTags.filter(
  (tag) => !tag.lastScannedAt
).length;

const hasActiveFilters =
  search.trim() !== '' ||
  hotelFilter !== 'ALL' ||
  typeFilter !== 'ALL' ||
  statusFilter !== 'ALL';

  async function handleCreateTag(formData: FormData) {
  if (isMutating) {
    return;
  }

  setActionMessage('');
  setActionError('');
  setIsMutating(true);

  try {
    await createTagAction(formData);

    setCreating(false);
    setActionMessage('NFC tag successfully created.');
    router.refresh();
  } catch (error) {
    setActionError(getActionErrorMessage(error));
  } finally {
    setIsMutating(false);
  }
}

async function handleUpdateTag(formData: FormData) {
  if (isMutating) {
    return;
  }

  setActionMessage('');
  setActionError('');
  setIsMutating(true);

  try {
    await updateTagAction(formData);

    setEditingTag(null);
    setActionMessage('NFC tag successfully updated.');
    router.refresh();
  } catch (error) {
    setActionError(getActionErrorMessage(error));
  } finally {
    setIsMutating(false);
  }
}


 async function runTagMutation({
  tagId,
  actionName,
  successText,
  formAction,
  optimisticUpdate,
}: {
  tagId: string;
  actionName: 'toggle' | 'rotate' | 'delete';
  successText: string;
  formAction: (formData: FormData) => Promise<unknown>;
  optimisticUpdate?: (currentTags: NfcTagItem[]) => NfcTagItem[];
}) {
  if (isMutating) {
    return;
  }

  const previousTags = localTags;

  setActionMessage('');
  setActionError('');
  setPendingTagAction(`${actionName}:${tagId}`);
  setIsMutating(true);

  if (optimisticUpdate) {
    setLocalTags((currentTags) => optimisticUpdate(currentTags));
  }

  try {
    const formData = new FormData();
    formData.set('tagId', tagId);

    await formAction(formData);

    setActionMessage(successText);

    /**
     * This is not a full browser reload.
     * It quietly syncs fresh server data in-place.
     */
    router.refresh();
  } catch (error) {
    setLocalTags(previousTags);
    setActionError(getActionErrorMessage(error));
  } finally {
    setPendingTagAction(null);
    setIsMutating(false);
  }
}


function handleToggleTagStatus(tag: NfcTagItem) {
  const nextStatus = tag.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

  runTagMutation({
    tagId: tag.id,
    actionName: 'toggle',
    successText:
      nextStatus === 'ACTIVE'
        ? 'NFC tag has been activated.'
        : 'NFC tag has been set inactive.',
    formAction: toggleTagStatusAction,
    optimisticUpdate: (currentTags) =>
      currentTags.map((item) =>
        item.id === tag.id
          ? {
              ...item,
              status: nextStatus,
            }
          : item
      ),
  });
}

function handleDeleteTag(tag: NfcTagItem) {
  setConfirmDialog({
    action: 'delete',
    tag,
    title: 'Delete NFC Tag?',
    description:
      'This will archive the tag, revoke active NFC sessions, and remove it from the active NFC tag list.',
    confirmLabel: 'Delete Tag',
  });
}

function handleRotateTagSecret(tag: NfcTagItem) {
  setConfirmDialog({
    action: 'rotate',
    tag,
    title: 'Rotate NFC Secret?',
    description:
      'This will revoke existing NFC access sessions. Reprint or rewrite the NFC card after rotating the secret.',
    confirmLabel: 'Rotate Secret',
  });
}

function handleConfirmTagAction() {
  if (!confirmDialog) {
    return;
  }

  const { action, tag } = confirmDialog;

  setConfirmDialog(null);

  if (action === 'rotate') {
    runTagMutation({
      tagId: tag.id,
      actionName: 'rotate',
      successText: 'NFC tag secret has been rotated.',
      formAction: rotateTagSecretAction,
    });

    return;
  }

  runTagMutation({
    tagId: tag.id,
    actionName: 'delete',
    successText: 'NFC tag has been deleted.',
    formAction: deleteTagAction,
    optimisticUpdate: (currentTags) =>
      currentTags.filter((item) => item.id !== tag.id),
  });
}


return (
    <>


     <section className="mb-6 overflow-hidden rounded-[2.25rem] border border-[#c99c38]/25 bg-[#11100b] text-white shadow-[0_24px_70px_rgba(0,0,0,0.16)]">
  <div className="relative p-4 sm:p-6">
    <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-[#c99c38]/25 blur-3xl" />
    <div className="pointer-events-none absolute -bottom-24 left-10 size-64 rounded-full bg-emerald-500/10 blur-3xl" />

    <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-[#c99c38]/35 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#f1c66a]">
          <RadioTower className="size-4" />
          NFC Access Control
        </p>

        <h2 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">
          NFC Tag Management
        </h2>

        <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-white/60">
          Create secure NFC launch links, assign room or public location tags,
          monitor scan activity, rotate secrets, and control guest portal access.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setCreating(true)}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#d6a738] px-5 py-3 text-sm font-black text-black shadow-[0_16px_35px_rgba(214,167,56,0.25)] transition hover:bg-[#f1c66a]"
      >
        <Plus className="size-4" />
        Create NFC Tag
      </button>
    </div>
  </div>

  <div className="grid border-t border-white/10 bg-black/20 sm:grid-cols-4">
    <div className="border-b border-white/10 p-5 sm:border-b-0 sm:border-r">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d6a738]">
        Total Tags
      </p>
      <p className="mt-1 text-3xl font-black">{localTags.length}</p>
      <p className="mt-1 text-xs font-semibold text-white/45">
        Registered NFC access points
      </p>
    </div>

    <div className="border-b border-white/10 p-5 sm:border-b-0 sm:border-r">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d6a738]">
        Active
      </p>
      <p className="mt-1 text-3xl font-black">{activeTagCount}</p>
      <p className="mt-1 text-xs font-semibold text-white/45">
        Currently scannable
      </p>
    </div>

    <div className="border-b border-white/10 p-5 sm:border-b-0 sm:border-r">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d6a738]">
        Room Tags
      </p>
      <p className="mt-1 text-3xl font-black">{roomTagCount}</p>
      <p className="mt-1 text-xs font-semibold text-white/45">
        Private room access
      </p>
    </div>

    <div className="p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d6a738]">
        Never Scanned
      </p>
      <p className="mt-1 text-3xl font-black">{neverScannedCount}</p>
      <p className="mt-1 text-xs font-semibold text-white/45">
        Needs testing or deployment
      </p>
    </div>
  </div>
</section>

<section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
  <NfcMetricCard
    icon={<ShieldCheck className="size-5" />}
    label="Active Tags"
    value={activeTagCount}
    helper="Guest access enabled"
    tone="green"
  />

  <NfcMetricCard
    icon={<X className="size-5" />}
    label="Inactive Tags"
    value={inactiveTagCount}
    helper="Disabled or hidden"
  />

  <NfcMetricCard
    icon={<Hotel className="size-5" />}
    label="Room Tags"
    value={roomTagCount}
    helper="Private stay sessions"
    tone="blue"
  />

  <NfcMetricCard
    icon={<UsersRound className="size-5" />}
    label="Public Tags"
    value={publicTagCount}
    helper="Lobby, pool, dining, amenities"
    tone="amber"
  />
</section>

<section className="mb-6 rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
    <div>
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b88938]">
        Search & Filters
      </p>

      <h3 className="mt-1 text-xl font-black text-[#11100b] dark:text-white">
        Find NFC Access Points
      </h3>

      <p className="mt-1 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
        Search by tag name, ID, hotel, room, location, or linked destination.
      </p>
    </div>

    <span className="w-fit rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
      Showing {filteredTags.length} of {localTags.length}
    </span>
  </div>

  <div
    className={
      canChangeHotel
        ? 'mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_160px_160px]'
        : 'mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_160px]'
    }
  >
    <label className="grid gap-1">
      <span className="text-xs font-black uppercase text-neutral-500 dark:text-neutral-400">
        Search NFC Tags
      </span>

      <div className="flex h-12 items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 dark:border-neutral-800 dark:bg-neutral-950">
        <Search className="size-4 shrink-0 text-neutral-400" />

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, tag ID, room, location..."
          className="w-full bg-transparent text-sm font-bold text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-white"
        />
      </div>
    </label>

    {canChangeHotel ? (
      <label className="grid gap-1">
        <span className="text-xs font-black uppercase text-neutral-500 dark:text-neutral-400">
          Hotel
        </span>

        <select
          value={hotelFilter}
          onChange={(event) => setHotelFilter(event.target.value)}
          className="h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
        >
          <option value="ALL">All Hotels</option>
          {hotels.map((hotel) => (
            <option key={hotel.id} value={hotel.id}>
              {hotel.name}
            </option>
          ))}
        </select>
      </label>
    ) : null}

    <label className="grid gap-1">
      <span className="text-xs font-black uppercase text-neutral-500 dark:text-neutral-400">
        Type
      </span>

      <select
        value={typeFilter}
        onChange={(event) => setTypeFilter(event.target.value)}
        className="h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
      >
        <option value="ALL">All Types</option>
        {tagTypes.map((tagType) => (
          <option key={tagType} value={tagType}>
            {tagType.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
    </label>

    <label className="grid gap-1">
      <span className="text-xs font-black uppercase text-neutral-500 dark:text-neutral-400">
        Status
      </span>

      <select
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value)}
        className="h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
      >
        <option value="ALL">All Status</option>
        {tagStatuses.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
    </label>
  </div>

  {hasActiveFilters ? (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => {
          setSearch('');
          setHotelFilter('ALL');
          setTypeFilter('ALL');
          setStatusFilter('ALL');
        }}
        className="rounded-full bg-black px-4 py-2 text-xs font-black text-white transition hover:bg-neutral-800 dark:bg-gold dark:text-black dark:hover:bg-gold/80"
      >
        Clear Filters
      </button>
    </div>
  ) : null}
</section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filteredTags.map((tag) => {
        const secureLaunchUrl = tag.secureLaunchUrl;
        const lockedDestinationUrl = tag.lockedDestinationUrl;

        const sessionMode = getSessionModeInfo({
          tagType: tag.tagType,
          roomId: tag.roomId,
          locationId: tag.locationId,
        });

        const SessionIcon =
          sessionMode.mode === 'PRIVATE_ROOM' ? ShieldCheck : UsersRound;

        return (
  <article
    key={tag.id}
    className="overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
  >
    <div className="border-b border-neutral-100 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-black text-[#11100b] dark:text-white">
              {tag.label}
            </h3>

            <StatusBadge status={tag.status} />
          </div>

          <p className="mt-0.5 truncate text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            {tag.hotelName}
          </p>
        </div>

        <span
          className={
            tag.status === 'ACTIVE'
              ? 'grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700'
              : 'grid size-10 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300'
          }
        >
          <RadioTower className="size-4" />
        </span>
      </div>
    </div>

    <div className="space-y-3 p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-950">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-neutral-400">
            Tag ID
          </p>
          <p className="mt-1 truncate text-sm font-black tracking-[0.14em] text-[#11100b] dark:text-white">
            {tag.code}
          </p>
        </div>

        <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-950">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-neutral-400">
            Assignment
          </p>
          <p className="mt-1 truncate text-sm font-black text-[#11100b] dark:text-white">
            {getAssignmentLabel(tag)}
          </p>
        </div>

        <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-950">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-neutral-400">
            Type
          </p>
          <p className="mt-1 truncate text-sm font-black text-[#11100b] dark:text-white">
            {tag.tagType.replaceAll('_', ' ')}
          </p>
        </div>

        <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-950">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-neutral-400">
            Last Scan
          </p>
          <p className="mt-1 truncate text-xs font-black text-[#11100b] dark:text-white">
            {formatDate(tag.lastScannedAt)}
          </p>
        </div>
      </div>

      <div className={`rounded-xl border p-3 text-xs ${sessionMode.containerClass}`}>
        <div className="flex items-start gap-2.5">
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-xl ${sessionMode.iconClass}`}
          >
            <SessionIcon className="size-4" />
          </span>

          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] opacity-70">
              Session Mode
            </p>

            <p className="mt-0.5 truncate font-black">
              {sessionMode.label}
            </p>

            <p className="mt-1 line-clamp-2 text-[11px] font-bold leading-4 opacity-75">
              {sessionMode.description}
            </p>
          </div>
        </div>
      </div>

      <NfcUrlBox label="Secure NFC URL" value={secureLaunchUrl} />

      <NfcUrlBox
        label="Guest Destination"
        value={lockedDestinationUrl}
      />

      <div className="grid gap-2 sm:grid-cols-2">
       <button
            type="button"
            disabled={pendingTagAction === `toggle:${tag.id}` || isMutating}
            onClick={() => handleToggleTagStatus(tag)}
            className={
              tag.status === 'ACTIVE'
                ? 'inline-flex h-9 w-full items-center justify-center rounded-xl bg-neutral-900 text-xs font-black text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-800 dark:hover:bg-neutral-700'
                : 'inline-flex h-9 w-full items-center justify-center rounded-xl bg-emerald-600 text-xs font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50'
            }
          >
            {pendingTagAction === `toggle:${tag.id}`
              ? 'Updating...'
              : tag.status === 'ACTIVE'
                ? 'Set Inactive'
                : 'Set Active'}
          </button>

        <button
          type="button"
          onClick={() => setEditingTag(tag)}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 text-xs font-black hover:bg-neutral-50 dark:border-neutral-800 dark:text-white dark:hover:bg-neutral-950"
        >
          <Pencil className="size-3.5" />
          Edit
        </button>

          <button
        type="button"
        disabled={pendingTagAction === `rotate:${tag.id}` || isMutating}
        onClick={() => handleRotateTagSecret(tag)}
        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 text-xs font-black text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RotateCcw className="size-3.5" />
        {pendingTagAction === `rotate:${tag.id}` ? 'Rotating...' : 'Rotate'}
      </button>

        <button
            type="button"
            disabled={pendingTagAction === `delete:${tag.id}` || isMutating}
            onClick={() => handleDeleteTag(tag)}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-red-600 text-xs font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
            {pendingTagAction === `delete:${tag.id}` ? 'Deleting...' : 'Delete'}
          </button>
      </div>


    </div>
  </article>
);
        })}
        {!filteredTags.length ? (
          <div className="rounded-[2rem] border border-dashed border-neutral-300 bg-white p-10 text-center md:col-span-2 2xl:col-span-3 dark:border-neutral-800 dark:bg-neutral-900">
            <RadioTower className="mx-auto size-10 text-neutral-300 dark:text-neutral-600" />

            <p className="mt-4 font-black text-[#11100b] dark:text-white">
              No NFC tags found.
            </p>

            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Try changing your search or filters, or create a new NFC tag.
            </p>

            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-black px-5 text-sm font-black text-white hover:bg-neutral-800 dark:bg-gold dark:text-black dark:hover:bg-gold/80"
            >
              <Plus className="size-4" />
              Create NFC Tag
            </button>
          </div>
) : null}
      </div>

      {creating ? (
        <Modal
          title="Create NFC Tag"
          description="Create a secure NFC launch URL with an automatically generated Unique Tag ID."
          onClose={() => setCreating(false)}
        >
         <CreateTagForm
              hotels={hotels}
              rooms={rooms}
              locations={locations}
              tagTypes={tagTypes}
              canChangeHotel={canChangeHotel}
              currentHotelId={currentHotelId}
              existingCodes={localTags.map((tag) => tag.code)}
              action={handleCreateTag}
            />
        </Modal>
      ) : null}

      {editingTag ? (
        <Modal
          title="Edit NFC Tag"
          description="Update assignment, status, and regenerate the Unique Tag ID when needed."
          onClose={() => setEditingTag(null)}
        >
         <EditTagForm
              tag={editingTag}
              rooms={rooms}
              locations={locations}
              tagTypes={tagTypes}
              tagStatuses={tagStatuses}
              existingCodes={localTags.map((tag) => tag.code)}
              action={handleUpdateTag}
            />
        </Modal>
      ) : null}

      {toast ? (
  <div className="fixed right-6 top-24 z-[120] w-[calc(100%-3rem)] max-w-sm">
    <div
      className={
        toast.type === 'success'
          ? 'rounded-3xl border border-emerald-200 bg-emerald-50/95 p-4 text-sm font-black text-emerald-800 shadow-2xl backdrop-blur-xl'
          : 'rounded-3xl border border-red-200 bg-red-50/95 p-4 text-sm font-black text-red-800 shadow-2xl backdrop-blur-xl'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] opacity-70">
            {toast.type === 'success' ? 'Success' : 'Error'}
          </p>
          <p className="mt-1">{toast.message}</p>
        </div>

        <button
          type="button"
          onClick={() => setToast(null)}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70 text-current transition hover:bg-white"
          aria-label="Close notification"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  </div>
) : null}

    <NfcActionConfirmDialog
      dialog={confirmDialog}
      onCancel={() => setConfirmDialog(null)}
      onConfirm={handleConfirmTagAction}
    />

    </>

    
  );
}