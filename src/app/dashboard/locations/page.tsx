import { type ReactNode } from 'react';
import Link from 'next/link';
import { Building2, CheckCircle2, MapPin, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { ModalOpenButton } from '@/components/dashboard/ModalOpenButton';
import {
  DirectoryActionForm,
  DirectoryConfirmButton,
} from './DirectoryClientActions';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import {
  createLocationAction,
  createRoomAction,
  deleteLocationAction,
  deleteRoomAction,
  updateLocationAction,
  updateRoomAction,
} from './actions';


const LOCATION_TYPES = [
  'POOL',
  'LOBBY',
  'RESTAURANT',
  'PARKING',
  'AMENITY',
  'GYM',
  'BAR',
  'OTHER',
] as const;

type DirectoryTab = 'rooms' | 'locations';

type Message =
  | {
      type: 'success' | 'error';
      text: string;
    }
  | null;

function FormField({
  label,
  helper,
  children,
  className = '',
}: {
  label: string;
  helper?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`grid gap-2 ${className}`}>
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
  id,
  title,
  description,
  children,
  size = 'max-w-3xl',
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  size?: string;
}) {
  return (
    <dialog
      id={id}
      className={`w-[calc(100%-1.5rem)] ${size} rounded-[2rem] border border-neutral-200 bg-white p-0 shadow-2xl backdrop:bg-black/50`}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-neutral-100 bg-white p-5">
        <div>
          <h2 className="text-2xl font-black">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-neutral-500">{description}</p>
          ) : null}
        </div>

        <form method="dialog">
          <button
            className="grid size-10 place-items-center rounded-full bg-neutral-100 hover:bg-neutral-200"
            aria-label="Close modal"
          >
            <X className="size-5" />
          </button>
        </form>
      </div>

      <div className="max-h-[78vh] overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}

function Toast({
  message,
  closeHref,
}: {
  message: Message;
  closeHref: string;
}) {
  if (!message) {
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

     <Link
          href={closeHref}
          replace
          scroll={false}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70 hover:bg-white"
          aria-label="Close notification"
        >
          <X className="size-4" />
        </Link>
      </div>
    </div>
  );
}

function getActiveTab(tab?: string): DirectoryTab {
  return tab === 'locations' ? 'locations' : 'rooms';
}

function cleanSearchQuery(value?: string) {
  return String(value || '').trim().slice(0, 120);
}

function normalizeSearchValue(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function matchesSearch(values: unknown[], query: string) {
  if (!query) {
    return true;
  }

  const normalizedQuery = normalizeSearchValue(query);

  return values.some((value) =>
    normalizeSearchValue(value).includes(normalizedQuery)
  );
}

function buildDirectoryHref(tab: DirectoryTab, query?: string) {
  const params = new URLSearchParams();

  params.set('tab', tab);

  if (query) {
    params.set('q', query);
  }

  return `/dashboard/locations?${params.toString()}`;
}

function tabClassName(isActive: boolean) {
  return isActive
    ? 'inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-black px-5 text-sm font-black text-white shadow-sm'
    : 'inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white px-5 text-sm font-black text-neutral-700 hover:bg-neutral-50';
}

function countBadgeClassName(isActive: boolean) {
  return isActive
    ? 'rounded-full bg-white px-2 py-0.5 text-xs font-black text-black'
    : 'rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-black text-neutral-700';
}

function CompactDetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs">
      <span className="shrink-0 font-black text-neutral-500">{label}</span>
      <span className="min-w-0 truncate text-right font-black text-neutral-900">
        {value}
      </span>
    </div>
  );
}

function getLocationsMessage(success?: string, error?: string): Message {
  if (success) {
    const messages: Record<string, string> = {
      'room-created': 'Room successfully added.',
      'room-updated': 'Room successfully updated.',
      'room-deleted': 'Room successfully deleted.',
      'location-created': 'Location successfully added.',
      'location-updated': 'Location successfully updated.',
      'location-deleted': 'Location successfully deleted.',
    };

    return {
      type: 'success',
      text: messages[success] ?? 'Action completed successfully.',
    };
  }

  if (error) {
    const messages: Record<string, string> = {
      'room-number-exists':
        'A room with this number already exists in this hotel. Please use a different room number.',
      'room-not-found': 'Room was not found.',
      'location-not-found': 'Location was not found.',
    };

    return {
      type: 'error',
      text: messages[error] ?? 'Something went wrong. Please try again.',
    };
  }

  return null;
}

export default async function RoomsAndLocationsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    success?: string;
    error?: string;
    tab?: string;
    q?: string;
  }>;
}) {
  const params = await searchParams;
  const activeTab = getActiveTab(params?.tab);
  const searchQuery = cleanSearchQuery(params?.q);
  const message = getLocationsMessage(params?.success, params?.error);

  const user = await requireUser();

  const hotelWhere = user.role === 'SUPER_ADMIN' ? {} : { id: user.hotelId! };
  const itemWhere =
    user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

  const [hotels, roomsRaw, locationsRaw] = await Promise.all([
    db.hotel.findMany({
      where: hotelWhere,
      orderBy: {
        name: 'asc',
      },
    }),

    db.room.findMany({
      where: {
        ...itemWhere,
        deletedAt: null,
      },
      include: {
        hotel: true,
        nfcTags: true,
      },
      orderBy: [
        {
          hotel: {
            name: 'asc',
          },
        },
        {
          number: 'asc',
        },
      ],
    }),

    db.location.findMany({
      where: {
        ...itemWhere,
        deletedAt: null,
      },
      include: {
        hotel: true,
        nfcTags: true,
      },
      orderBy: [
        {
          hotel: {
            name: 'asc',
          },
        },
        {
          name: 'asc',
        },
      ],
    }),
  ]);

  const rooms = roomsRaw.filter((room) =>
    matchesSearch(
      [
        room.hotel.name,
        room.number,
        room.name,
        room.floor,
        ...room.nfcTags.map((tag) => tag.code),
        ...room.nfcTags.map((tag) => tag.label),
      ],
      searchQuery
    )
  );

  const locations = locationsRaw.filter((location) =>
    matchesSearch(
      [
        location.hotel.name,
        location.name,
        location.type,
        location.description,
        ...location.nfcTags.map((tag) => tag.code),
        ...location.nfcTags.map((tag) => tag.label),
      ],
      searchQuery
    )
  );

  return (
    <div>
      <Toast message={message} closeHref={buildDirectoryHref(activeTab, searchQuery)} />

      <PageHeader
        title="Rooms & Locations"
        description="Create and manage guest rooms, pool areas, lobby panels, restaurants, amenities, and other NFC destinations."
      />

      <div className="mb-6 rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-soft">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-xl font-black">Room & Location Directory</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Use the tabs to manage rooms or non-room locations in a full-width
              workspace.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <ModalOpenButton
              modalId="add-room-modal"
              className={
                activeTab === 'rooms'
                  ? 'gap-2 bg-black text-white hover:bg-neutral-800'
                  : 'gap-2 border border-neutral-200 bg-white text-black hover:bg-neutral-100'
              }
            >
              <Plus className="size-4" />
              Add Room
            </ModalOpenButton>

            <ModalOpenButton
              modalId="add-location-modal"
              className={
                activeTab === 'locations'
                  ? 'gap-2 bg-black text-white hover:bg-neutral-800'
                  : 'gap-2 border border-neutral-200 bg-white text-black hover:bg-neutral-100'
              }
            >
              <Plus className="size-4" />
              Add Location
            </ModalOpenButton>
          </div>
        </div>

       <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-2 rounded-[1.5rem] bg-neutral-50 p-2 sm:flex-row">
              <Link
                href={buildDirectoryHref('rooms', searchQuery)}
                replace
                scroll={false}
                prefetch
                className={tabClassName(activeTab === 'rooms')}
              >
                <Building2 className="size-4" />
                Rooms
                <span className={countBadgeClassName(activeTab === 'rooms')}>
                  {rooms.length}
                </span>
              </Link>

              <Link
                href={buildDirectoryHref('locations', searchQuery)}
                replace
                scroll={false}
                prefetch
                className={tabClassName(activeTab === 'locations')}
              >
                <MapPin className="size-4" />
                Locations
                <span className={countBadgeClassName(activeTab === 'locations')}>
                  {locations.length}
                </span>
              </Link>
            </div>

            <form
              action="/dashboard/locations"
              method="GET"
              className="flex w-full flex-col gap-2 sm:flex-row xl:max-w-xl"
            >
              <input type="hidden" name="tab" value={activeTab} />

              <div className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4">
                <Search className="size-4 shrink-0 text-neutral-400" />
                <input
                  name="q"
                  defaultValue={searchQuery}
                  placeholder={
                    activeTab === 'rooms'
                      ? 'Search rooms, room number, floor, NFC tag...'
                      : 'Search locations, type, description, NFC tag...'
                  }
                  className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-neutral-400"
                />
              </div>

              <button
                type="submit"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-black px-5 text-sm font-black text-white hover:bg-neutral-800"
              >
                <Search className="size-4" />
                Search
              </button>

              {searchQuery ? (
                <Link
                  href={buildDirectoryHref(activeTab)}
                  replace
                  scroll={false}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-neutral-200 bg-white px-5 text-sm font-black text-neutral-700 hover:bg-neutral-50"
                >
                  Clear
                </Link>
              ) : null}
            </form>
          </div>
        {searchQuery ? (
          <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            Showing results for “{searchQuery}”.
          </div>
        ) : null}
      </div>

      {activeTab === 'rooms' ? (
        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-black">Rooms</h2>
              <p className="text-sm text-neutral-500">
                Guest rooms that can be connected to room-type NFC tags.
              </p>
            </div>

            <span className="w-fit rounded-full bg-black px-4 py-2 text-sm font-black text-white">
              {searchQuery
                ? `${rooms.length} of ${roomsRaw.length} rooms`
                : `${rooms.length} ${rooms.length === 1 ? 'room' : 'rooms'}`}
            </span>
          </div>

         <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[1800px]:grid-cols-5">
            {rooms.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-neutral-200 bg-white p-10 text-center md:col-span-2 2xl:col-span-3">
                <p className="font-black text-neutral-600">
                  {searchQuery ? 'No matching rooms found' : 'No rooms yet'}
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  {searchQuery
                    ? 'Try a different room name, number, floor, or NFC tag code.'
                    : 'Create your first room using Add Room.'}
                </p>
              </div>
            ) : null}

            {rooms.map((room) => {
              const editModalId = `edit-room-${room.id}`;

              return (
               <article
                  key={room.id}
                  className="overflow-hidden rounded-[1.35rem] border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl"
                >
                  <div className="border-b border-neutral-100 bg-neutral-50 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-black">
                            {room.name}
                          </h3>

                          <StatusBadge
                            status={room.isActive ? 'Active' : 'Inactive'}
                          />
                        </div>

                        <p className="mt-1 truncate text-xs font-semibold text-neutral-500">
                          {room.hotel.name} · Room {room.number}
                          {room.floor ? ` · ${room.floor}` : ''}
                        </p>
                      </div>

                      <Building2 className="size-4 shrink-0 text-neutral-400" />
                    </div>
                  </div>

                  <div className="space-y-3 p-3">
                    <div className="grid gap-1.5 rounded-xl bg-neutral-50 p-2">
                      <CompactDetailRow label="Room No." value={room.number} />
                      <CompactDetailRow label="Display" value={room.name} />
                      <CompactDetailRow label="Floor" value={room.floor || 'Not set'} />
                      <CompactDetailRow label="NFC Tags" value={room.nfcTags.length} />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <ModalOpenButton
                        modalId={editModalId}
                        className="h-9 gap-1.5 rounded-xl border border-neutral-200 bg-white text-xs font-black text-black hover:bg-neutral-100"
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </ModalOpenButton>

                     <DirectoryConfirmButton
                            id={room.id}
                            fieldName="roomId"
                            itemName={room.name}
                            itemType="room"
                            action={deleteRoomAction}
                            successMessage="Room successfully deleted."
                            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-red-600 text-xs font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                    </div>
                  </div>

                  <Modal
                    id={editModalId}
                    title={`Edit ${room.name}`}
                    description="Update room details and availability."
                  >
                  <DirectoryActionForm
                        action={updateRoomAction}
                        successMessage="Room successfully updated."
                        className="grid gap-5 md:grid-cols-2"
                      >
                      <input type="hidden" name="roomId" value={room.id} />

                      {user.role === 'SUPER_ADMIN' ? (
                        <FormField label="Hotel / Property">
                          <Select
                            name="hotelId"
                            defaultValue={room.hotelId}
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
                        <input
                          type="hidden"
                          name="hotelId"
                          value={room.hotelId}
                        />
                      )}

                      <FormField label="Room Number">
                        <Input
                          name="number"
                          defaultValue={room.number}
                          required
                        />
                      </FormField>

                      <FormField label="Room Display Name">
                        <Input name="name" defaultValue={room.name} required />
                      </FormField>

                      <FormField label="Floor / Area">
                        <Input name="floor" defaultValue={room.floor || ''} />
                      </FormField>

                      <label className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-3 md:col-span-2">
                        <input
                          name="isActive"
                          type="checkbox"
                          defaultChecked={room.isActive}
                          className="size-4 accent-black"
                        />
                        <span>
                          <span className="block text-sm font-black">
                            Available / Active
                          </span>
                          <span className="text-xs font-medium text-neutral-500">
                            Active rooms can be assigned to NFC tags and used in
                            guest ordering.
                          </span>
                        </span>
                      </label>

                      <div className="md:col-span-2">
                        <Button className="w-full">Save Room Changes</Button>
                      </div>
                   </DirectoryActionForm>
                  </Modal>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {activeTab === 'locations' ? (
        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-black">Locations</h2>
              <p className="text-sm text-neutral-500">
                Non-room areas such as pool, lobby, restaurant, parking, or
                amenities.
              </p>
            </div>

            <span className="w-fit rounded-full bg-black px-4 py-2 text-sm font-black text-white">
              {searchQuery
                ? `${locations.length} of ${locationsRaw.length} locations`
                : `${locations.length} ${
                    locations.length === 1 ? 'location' : 'locations'
                  }`}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[1800px]:grid-cols-5">
            {locations.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-neutral-200 bg-white p-10 text-center md:col-span-2 2xl:col-span-3">
                <p className="font-black text-neutral-600">
                  {searchQuery
                    ? 'No matching locations found'
                    : 'No locations yet'}
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  {searchQuery
                    ? 'Try a different location name, type, description, or NFC tag code.'
                    : 'Create your first location using Add Location.'}
                </p>
              </div>
            ) : null}

            {locations.map((location) => {
              const editModalId = `edit-location-${location.id}`;

              return (
                <article
                  key={location.id}
                  className="overflow-hidden rounded-[1.35rem] border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl"
                >
                  <div className="border-b border-neutral-100 bg-neutral-50 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-black">
                            {location.name}
                          </h3>

                          <StatusBadge
                            status={location.isActive ? 'Active' : 'Inactive'}
                          />
                        </div>

                        <p className="mt-1 truncate text-xs font-semibold text-neutral-500">
                          {location.hotel.name} · {location.type}
                        </p>
                      </div>

                      <MapPin className="size-4 shrink-0 text-neutral-400" />
                    </div>
                  </div>

                  <div className="space-y-3 p-3">
                    <div className="grid gap-1.5 rounded-xl bg-neutral-50 p-2">
                      <CompactDetailRow label="Name" value={location.name} />
                      <CompactDetailRow label="Type" value={location.type} />
                      <CompactDetailRow label="NFC Tags" value={location.nfcTags.length} />
                      <CompactDetailRow
                        label="Description"
                        value={location.description || 'No description'}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <ModalOpenButton
                        modalId={editModalId}
                        className="h-9 gap-1.5 rounded-xl border border-neutral-200 bg-white text-xs font-black text-black hover:bg-neutral-100"
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </ModalOpenButton>

                     <DirectoryConfirmButton
                            id={location.id}
                            fieldName="locationId"
                            itemName={location.name}
                            itemType="location"
                            action={deleteLocationAction}
                            successMessage="Location successfully deleted."
                            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-red-600 text-xs font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                    </div>
                  </div>

                  <Modal
                    id={editModalId}
                    title={`Edit ${location.name}`}
                    description="Update location details and availability."
                  >
                   <DirectoryActionForm
                  action={updateLocationAction}
                  successMessage="Location successfully updated."
                  className="grid gap-5 md:grid-cols-2"
                >
                      <input
                        type="hidden"
                        name="locationId"
                        value={location.id}
                      />

                      {user.role === 'SUPER_ADMIN' ? (
                        <FormField label="Hotel / Property">
                          <Select
                            name="hotelId"
                            defaultValue={location.hotelId}
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
                        <input
                          type="hidden"
                          name="hotelId"
                          value={location.hotelId}
                        />
                      )}

                      <FormField label="Location Name">
                        <Input
                          name="name"
                          defaultValue={location.name}
                          required
                        />
                      </FormField>

                      <FormField label="Location Type">
                        <Select
                          name="type"
                          defaultValue={location.type}
                          required
                        >
                          {LOCATION_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </Select>
                      </FormField>

                      <FormField
                        label="Guest-facing Description"
                        className="md:col-span-2"
                      >
                        <Textarea
                          name="description"
                          defaultValue={location.description || ''}
                        />
                      </FormField>

                      <label className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-3 md:col-span-2">
                        <input
                          name="isActive"
                          type="checkbox"
                          defaultChecked={location.isActive}
                          className="size-4 accent-black"
                        />
                        <span>
                          <span className="block text-sm font-black">
                            Available / Active
                          </span>
                          <span className="text-xs font-medium text-neutral-500">
                            Active locations can be assigned to NFC tags and
                            used in guest portal context.
                          </span>
                        </span>
                      </label>

                      <div className="md:col-span-2">
                        <Button className="w-full">
                          Save Location Changes
                        </Button>
                      </div>
                   </DirectoryActionForm>
                  </Modal>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <Modal
        id="add-room-modal"
        title="Add Room"
        description="Create a guest room destination that can be assigned to NFC tags."
      >
        <DirectoryActionForm
            action={createRoomAction}
            successMessage="Room successfully created."
            className="grid gap-5 md:grid-cols-2"
          >
          {user.role === 'SUPER_ADMIN' ? (
            <FormField
              label="Hotel / Property"
              helper="Choose the hotel where this room belongs."
            >
              <Select name="hotelId" required>
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : (
            <input type="hidden" name="hotelId" value={user.hotelId!} />
          )}

          <FormField label="Room Number" helper="Example: 305 or Villa A.">
            <Input name="number" placeholder="305" required />
          </FormField>

          <FormField
            label="Room Display Name"
            helper="Example: Deluxe King Room or Pool Villa."
          >
            <Input name="name" placeholder="Deluxe King Room" required />
          </FormField>

          <FormField
            label="Floor / Area"
            helper="Example: 3rd Floor or Beach Wing."
          >
            <Input name="floor" placeholder="3rd Floor" />
          </FormField>

          <div className="md:col-span-2">
            <Button className="w-full">Add Room</Button>
          </div>
       </DirectoryActionForm>
      </Modal>

      <Modal
        id="add-location-modal"
        title="Add Location"
        description="Create a non-room destination such as pool, lobby, restaurant, or amenity area."
      >
       <DirectoryActionForm
            action={createLocationAction}
            successMessage="Location successfully created."
            className="grid gap-5 md:grid-cols-2"
          >
          {user.role === 'SUPER_ADMIN' ? (
            <FormField
              label="Hotel / Property"
              helper="Choose the hotel where this location belongs."
            >
              <Select name="hotelId" required>
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : (
            <input type="hidden" name="hotelId" value={user.hotelId!} />
          )}

          <FormField
            label="Location Name"
            helper="Example: Pool Deck, Main Lobby, Rooftop Bar."
          >
            <Input name="name" placeholder="Pool Deck" required />
          </FormField>

          <FormField
            label="Location Type"
            helper="Controls what guest experience appears when assigned to NFC."
          >
            <Select name="type" required>
              {LOCATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField
            label="Guest-facing Description"
            helper="Optional context shown internally or used as area description."
            className="md:col-span-2"
          >
            <Textarea
              name="description"
              placeholder="Example: Pool area near the towel station. Guests can request towels and order drinks here."
            />
          </FormField>

          <div className="md:col-span-2">
            <Button className="w-full">Add Location</Button>
          </div>
        </DirectoryActionForm>
      </Modal>
    </div>
  );
}
