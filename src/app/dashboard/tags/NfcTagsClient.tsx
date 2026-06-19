'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Link2,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 py-4">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-100 bg-white p-5">
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

        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
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

function getHttpBaseOrigin() {
  if (typeof window === 'undefined') {
    return 'http://192.168.0.130:3000';
  }

  const { hostname, port } = window.location;

  return `http://${hostname}${port ? `:${port}` : ''}`;
}

function toHttpAppUrl(value: string) {
  if (!value) {
    return value;
  }

  try {
    const httpBaseOrigin = getHttpBaseOrigin();

    const currentHostname =
      typeof window !== 'undefined'
        ? window.location.hostname
        : '192.168.0.130';

    const url = new URL(value, httpBaseOrigin);

    const isLocalHost =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '0.0.0.0' ||
      url.hostname.startsWith('192.168.');

    if (isLocalHost) {
      url.protocol = 'http:';
      url.hostname = currentHostname;
      url.port = url.port || '3000';

      return url.toString();
    }

    if (url.protocol === 'https:') {
      url.protocol = 'http:';
    }

    return url.toString();
  } catch {
    return value.replace(/^https:\/\//i, 'http://');
  }
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
}: {
  hotels: HotelOption[];
  rooms: RoomOption[];
  locations: LocationOption[];
  tagTypes: string[];
  canChangeHotel: boolean;
  currentHotelId: string;
  existingCodes: string[];
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
    <form action={createTagAction} className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
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
}: {
  tag: NfcTagItem;
  rooms: RoomOption[];
  locations: LocationOption[];
  tagTypes: string[];
  tagStatuses: string[];
  existingCodes: string[];
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
    <form action={updateTagAction} className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
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
  const [creating, setCreating] = useState(false);
  const [editingTag, setEditingTag] = useState<NfcTagItem | null>(null);

  const [search, setSearch] = useState('');
  const [hotelFilter, setHotelFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const message = successMessage(success);

  const filteredTags = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return tags.filter((tag) => {
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
  }, [hotelFilter, search, statusFilter, tags, typeFilter]);

  return (
    <>
      {message ? (
        <div className="mb-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
          {message}
        </div>
      ) : null}

      <div className="mb-6 rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">NFC Tags</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Search, filter, create, edit, rotate, and delete NFC guest access
              tags.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-black px-5 text-sm font-black text-white hover:bg-neutral-800"
          >
            <Plus className="size-4" />
            Create NFC Tag
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_180px_180px]">
          <label className="grid gap-1">
            <span className="text-xs font-black uppercase text-neutral-500">
              Search NFC Tags
            </span>
            <div className="flex h-11 items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4">
              <Search className="size-4 shrink-0 text-neutral-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, tag ID, room, location..."
                className="w-full bg-transparent text-sm font-bold outline-none"
              />
            </div>
          </label>

          {canChangeHotel ? (
            <label className="grid gap-1">
              <span className="text-xs font-black uppercase text-neutral-500">
                Hotel Filter
              </span>
              <select
                value={hotelFilter}
                onChange={(event) => setHotelFilter(event.target.value)}
                className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none"
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
            <span className="text-xs font-black uppercase text-neutral-500">
              Type Filter
            </span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none"
            >
              <option value="ALL">All Types</option>
              {tagTypes.map((tagType) => (
                <option key={tagType} value={tagType}>
                  {tagType}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-black uppercase text-neutral-500">
              Status Filter
            </span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none"
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

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">
            Showing {filteredTags.length} of {tags.length}
          </span>

          {search ||
          hotelFilter !== 'ALL' ||
          typeFilter !== 'ALL' ||
          statusFilter !== 'ALL' ? (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setHotelFilter('ALL');
                setTypeFilter('ALL');
                setStatusFilter('ALL');
              }}
              className="rounded-full bg-black px-3 py-1 text-xs font-black text-white"
            >
              Clear Filters
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {filteredTags.map((tag) => {
        const secureLaunchUrl = toHttpAppUrl(tag.secureLaunchUrl);
        const lockedDestinationUrl = toHttpAppUrl(tag.lockedDestinationUrl);

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
              className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm"
            >
              <div className="border-b border-neutral-100 bg-neutral-50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-xl font-black">
                      {tag.label}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-neutral-500">
                      {tag.hotelName}
                    </p>
                  </div>

                  <StatusBadge status={tag.status} />
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div className="rounded-2xl bg-neutral-50 p-4 text-sm">
                  <p>
                    <b>Unique Tag ID:</b> {tag.code}
                  </p>
                  <p className="mt-2">
                    <b>Tag Type:</b> {tag.tagType}
                  </p>
                  <p className="mt-2">
                    <b>Linked Destination:</b> {tag.linkedDestination}
                  </p>
                  <p className="mt-2">
                    <b>Last Scanned:</b> {formatDate(tag.lastScannedAt)}
                  </p>
                </div>
                <div
                    className={`rounded-2xl border p-4 text-sm ${sessionMode.containerClass}`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-xl ${sessionMode.iconClass}`}
                      >
                        <SessionIcon className="size-4" />
                      </span>

                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.16em] opacity-70">
                          Session Mode
                        </p>

                        <p className="mt-1 font-black">{sessionMode.label}</p>

                        <p className="mt-1 text-xs font-bold leading-5 opacity-75">
                          {sessionMode.description}
                        </p>
                      </div>
                    </div>
                  </div>

                <div className="space-y-2 rounded-2xl bg-neutral-50 p-4 text-xs">
                  <div>
                    <p className="mb-1 font-black text-neutral-500">
                      Secure NFC Launch URL
                    </p>
                    <a
                      href={secureLaunchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all font-bold text-blue-700 hover:underline"
                    >
                      {secureLaunchUrl}
                    </a>
                  </div>

                  <div>
                    <p className="mb-1 font-black text-neutral-500">
                      Protected Guest Destination
                    </p>
                    <a
                      href={lockedDestinationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all font-bold text-blue-700 hover:underline"
                    >
                      {lockedDestinationUrl}
                    </a>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <form action={toggleTagStatusAction}>
                    <input type="hidden" name="tagId" value={tag.id} />
                    <button
                      type="submit"
                      className={
                        tag.status === 'ACTIVE'
                          ? 'inline-flex h-10 w-full items-center justify-center rounded-2xl bg-neutral-900 text-sm font-black text-white hover:bg-neutral-800'
                          : 'inline-flex h-10 w-full items-center justify-center rounded-2xl bg-emerald-600 text-sm font-black text-white hover:bg-emerald-700'
                      }
                    >
                      {tag.status === 'ACTIVE' ? 'Set Inactive' : 'Set Active'}
                    </button>
                  </form>

                  <a
                    href={secureLaunchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-neutral-200 text-sm font-black hover:bg-neutral-50"
                  >
                    <QrCode className="size-4" />
                    Open
                  </a>

                  <button
                    type="button"
                    onClick={() => setEditingTag(tag)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-neutral-200 text-sm font-black hover:bg-neutral-50"
                  >
                    <Pencil className="size-4" />
                    Edit
                  </button>

                  <form action={rotateTagSecretAction}>
                    <input type="hidden" name="tagId" value={tag.id} />
                    <button
                      type="submit"
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 text-sm font-black text-white hover:bg-amber-600"
                    >
                      <RotateCcw className="size-4" />
                      Rotate
                    </button>
                  </form>

                  <form action={deleteTagAction}>
                    <input type="hidden" name="tagId" value={tag.id} />
                    <button
                      type="submit"
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 text-sm font-black text-white hover:bg-red-700"
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </button>
                  </form>
                </div>

                <a
                  href={lockedDestinationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-black text-sm font-black text-white hover:bg-neutral-800"
                >
                  <Link2 className="size-4" />
                  View Guest Portal
                </a>
              </div>
            </article>
          );
        })}

        {!filteredTags.length ? (
          <div className="rounded-[2rem] border border-dashed border-neutral-300 bg-white p-10 text-center md:col-span-2 2xl:col-span-3">
            <p className="font-black">No NFC tags found.</p>
            <p className="mt-1 text-sm text-neutral-500">
              Try changing your search or filters.
            </p>
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
            existingCodes={tags.map((tag) => tag.code)}
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
            existingCodes={tags.map((tag) => tag.code)}
          />
        </Modal>
      ) : null}
    </>
  );
}