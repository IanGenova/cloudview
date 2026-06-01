'use client';

import { type ReactNode, useMemo, useState } from 'react';
import {
  Link2,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  Trash2,
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-neutral-100 bg-white p-5">
          <div>
            <h2 className="text-2xl font-black">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-neutral-500">{description}</p>
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

        <div className="p-5">{children}</div>
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

function getHttpsBaseOrigin() {
  if (typeof window === 'undefined') {
    return 'https://192.168.0.130:3000';
  }

  const { hostname, port } = window.location;
  return `https://${hostname}${port ? `:${port}` : ''}`;
}

function toHttpsAppUrl(value: string) {
  if (!value) {
    return value;
  }

  try {
    const httpsBaseOrigin = getHttpsBaseOrigin();

    const currentHostname =
      typeof window !== 'undefined' ? window.location.hostname : '192.168.0.130';

    const url = new URL(value, httpsBaseOrigin);

    const isLocalHost =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '0.0.0.0' ||
      url.hostname.startsWith('192.168.');

    if (isLocalHost) {
      url.protocol = 'https:';
      url.hostname = currentHostname;
      url.port = url.port || '3000';
      return url.toString();
    }

    if (url.protocol === 'http:') {
      url.protocol = 'https:';
    }

    return url.toString();
  } catch {
    return value.replace(/^http:\/\//i, 'https://');
  }
}

function CreateTagForm({
  hotels,
  rooms,
  locations,
  tagTypes,
  canChangeHotel,
  currentHotelId,
}: {
  hotels: HotelOption[];
  rooms: RoomOption[];
  locations: LocationOption[];
  tagTypes: string[];
  canChangeHotel: boolean;
  currentHotelId: string;
}) {
  return (
    <form action={createTagAction} className="grid gap-5 md:grid-cols-3">
      {canChangeHotel ? (
        <FormField
          label="Hotel / Property"
          helper="Select which hotel this NFC tag belongs to."
        >
          <Select name="hotelId" defaultValue={currentHotelId} required>
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
        <Input name="label" placeholder="Room 305 Main Panel" required />
      </FormField>

      <FormField
        label="Unique Tag ID"
        helper="This becomes the internal tag code. Use lowercase letters, numbers, and hyphens."
      >
        <Input name="code" placeholder="room-305-main-panel" required />
      </FormField>

      <FormField label="Tag Type" helper="Choose where the NFC panel is placed.">
        <Select name="tagType" required>
          {tagTypes.map((tagType) => (
            <option key={tagType} value={tagType}>
              {tagType}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Assigned Room" helper="Use this for room panels.">
        <Select name="roomId">
          <option value="">No room</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.hotelName} · Room {room.number}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label="Assigned Location"
        helper="Use this for pool, lobby, restaurant, or amenity panels."
      >
        <Select name="locationId">
          <option value="">No location</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.hotelName} · {location.name}
            </option>
          ))}
        </Select>
      </FormField>

      <div className="md:col-span-3">
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
}: {
  tag: NfcTagItem;
  rooms: RoomOption[];
  locations: LocationOption[];
  tagTypes: string[];
  tagStatuses: string[];
}) {
  return (
    <form action={updateTagAction} className="grid gap-5 md:grid-cols-2">
      <input type="hidden" name="tagId" value={tag.id} />

      <FormField label="NFC Name">
        <Input name="label" defaultValue={tag.label} required />
      </FormField>

      <FormField label="Unique Tag ID">
        <Input name="code" defaultValue={tag.code} required />
      </FormField>

      <FormField label="Tag Type">
        <Select name="tagType" defaultValue={tag.tagType} required>
          {tagTypes.map((tagType) => (
            <option key={tagType} value={tagType}>
              {tagType}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Status">
        <Select name="status" defaultValue={tag.status} required>
          {tagStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Assigned Room">
        <Select name="roomId" defaultValue={tag.roomId ?? ''}>
          <option value="">No room</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.hotelName} · Room {room.number}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Assigned Location">
        <Select name="locationId" defaultValue={tag.locationId ?? ''}>
          <option value="">No location</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.hotelName} · {location.name}
            </option>
          ))}
        </Select>
      </FormField>

      <div className="md:col-span-2">
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
          const secureLaunchUrl = toHttpsAppUrl(tag.secureLaunchUrl);
          const lockedDestinationUrl = toHttpsAppUrl(tag.lockedDestinationUrl);

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
          description="Create a secure NFC launch URL for a room, pool, restaurant, or hotel location."
          onClose={() => setCreating(false)}
        >
          <CreateTagForm
            hotels={hotels}
            rooms={rooms}
            locations={locations}
            tagTypes={tagTypes}
            canChangeHotel={canChangeHotel}
            currentHotelId={currentHotelId}
          />
        </Modal>
      ) : null}

      {editingTag ? (
        <Modal
          title="Edit NFC Tag"
          description="Update the NFC tag label, assignment, type, and status."
          onClose={() => setEditingTag(null)}
        >
          <EditTagForm
            tag={editingTag}
            rooms={rooms}
            locations={locations}
            tagTypes={tagTypes}
            tagStatuses={tagStatuses}
          />
        </Modal>
      ) : null}
    </>
  );
}