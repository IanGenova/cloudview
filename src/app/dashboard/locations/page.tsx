import { type ReactNode } from 'react';
import { Building2, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { ModalOpenButton } from '@/components/dashboard/ModalOpenButton';
import { DashboardSuccess } from '@/components/dashboard/DashboardSuccess';
import { ConfirmSubmitButton } from '@/components/dashboard/ConfirmSubmitButton';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import {
  createLocationAction,
  createRoomAction,
  deleteLocationAction,
  deleteRoomAction,
  updateLocationAction,
  updateRoomAction
} from './actions';
const LOCATION_TYPES = [
  'POOL',
  'LOBBY',
  'RESTAURANT',
  'SPA',
  'PARKING',
  'AMENITY',
  'GYM',
  'BAR',
  'OTHER'
] as const;

function FormField({
  label,
  helper,
  children,
  className = ''
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
  size = 'max-w-3xl'
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

export default async function RoomsAndLocationsPage({
  searchParams
}: {
  searchParams?: Promise<{ success?: string }>;
}) {
  const params = await searchParams;

  const user = await requireUser();

  const hotelWhere = user.role === 'SUPER_ADMIN' ? {} : { id: user.hotelId! };
  const itemWhere = user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

  const [hotels, rooms, locations] = await Promise.all([
    db.hotel.findMany({
      where: hotelWhere,
      orderBy: {
        name: 'asc'
      }
    }),

    db.room.findMany({
      where: {
        ...itemWhere,
        deletedAt: null
      },
      include: {
        hotel: true,
        nfcTags: true
      },
      orderBy: [
        {
          hotel: {
            name: 'asc'
          }
        },
        {
          number: 'asc'
        }
      ]
    }),

    db.location.findMany({
      where: {
        ...itemWhere,
        deletedAt: null
      },
      include: {
        hotel: true,
        nfcTags: true
      },
      orderBy: [
        {
          hotel: {
            name: 'asc'
          }
        },
        {
          name: 'asc'
        }
      ]
    })
  ]);

  return (
    <div>
      <PageHeader
      
        title="Rooms & Locations"
        description="Create and manage guest rooms, pool areas, lobby panels, restaurants, amenities, and other NFC destinations."
      />
          <DashboardSuccess
            success={params?.success}
            messages={{
              'room-created': 'Room successfully added.',
              'room-updated': 'Room successfully updated.',
              'room-deleted': 'Room successfully deleted.',
              'location-created': 'Location successfully added.',
              'location-updated': 'Location successfully updated.',
              'location-deleted': 'Location successfully deleted.'
            }}
                />
      <div className="mb-6 flex flex-col gap-3 rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-soft md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-black">Room & Location Directory</h2>
          <p className="mt-1 text-sm text-neutral-500">
            These records can be assigned to NFC tags and shown in the guest portal.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <ModalOpenButton
            modalId="add-room-modal"
            className="gap-2 border border-neutral-200 bg-white text-black hover:bg-neutral-100"
          >
            <Plus className="size-4" />
            Add Room
          </ModalOpenButton>

          <ModalOpenButton
            modalId="add-location-modal"
            className="gap-2 bg-black text-white hover:bg-neutral-800"
          >
            <Plus className="size-4" />
            Add Location
          </ModalOpenButton>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">Rooms</h2>
              <p className="text-sm text-neutral-500">
                Guest rooms that can be connected to room-type NFC tags.
              </p>
            </div>

            <span className="rounded-full bg-black px-4 py-2 text-sm font-black text-white">
              {rooms.length}
            </span>
          </div>

          <div className="grid gap-4">
            {rooms.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-neutral-200 bg-white p-8 text-center">
                <p className="font-black text-neutral-600">No rooms yet</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Create your first room using Add Room.
                </p>
              </div>
            ) : null}

            {rooms.map((room) => {
              const editModalId = `edit-room-${room.id}`;

              return (
                <article
                  key={room.id}
                  className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-soft"
                >
                  <div className="border-b border-neutral-100 bg-neutral-50 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-xl font-black">{room.name}</h3>
                          <StatusBadge status={room.isActive ? 'Active' : 'Inactive'} />
                        </div>

                        <p className="mt-1 text-sm font-semibold text-neutral-500">
                          {room.hotel.name} · Room {room.number}
                          {room.floor ? ` · ${room.floor}` : ''}
                        </p>
                      </div>

                      <Building2 className="size-6 shrink-0 text-neutral-400" />
                    </div>
                  </div>

                  <div className="space-y-4 p-5">
                    <div className="grid gap-2 rounded-2xl bg-neutral-50 p-4 text-sm">
                      <p>
                        <span className="font-black">Room Number:</span>{' '}
                        <span className="font-semibold text-neutral-600">{room.number}</span>
                      </p>

                      <p>
                        <span className="font-black">Display Name:</span>{' '}
                        <span className="font-semibold text-neutral-600">{room.name}</span>
                      </p>

                      <p>
                        <span className="font-black">Floor / Area:</span>{' '}
                        <span className="font-semibold text-neutral-600">
                          {room.floor || 'Not provided'}
                        </span>
                      </p>

                      <p>
                        <span className="font-black">Linked NFC Tags:</span>{' '}
                        <span className="font-semibold text-neutral-600">
                          {room.nfcTags.length}
                        </span>
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <ModalOpenButton
                        modalId={editModalId}
                        className="gap-2 border border-neutral-200 bg-white text-black hover:bg-neutral-100"
                      >
                        <Pencil className="size-4" />
                        Edit
                      </ModalOpenButton>

                      <form action={deleteRoomAction}>
                        <input type="hidden" name="roomId" value={room.id} />
                                  <ConfirmSubmitButton
                                label="Delete"
                                message="Are you sure you want to delete this room?"
                                className="bg-red-600 text-white hover:bg-red-700"
                              />
                      </form>
                    </div>
                  </div>

                  <Modal
                    id={editModalId}
                    title={`Edit ${room.name}`}
                    description="Update room details and availability."
                  >
                    <form action={updateRoomAction} className="grid gap-5 md:grid-cols-2">
                      <input type="hidden" name="roomId" value={room.id} />

                      {user.role === 'SUPER_ADMIN' ? (
                        <FormField label="Hotel / Property">
                          <Select name="hotelId" defaultValue={room.hotelId} required>
                            {hotels.map((hotel) => (
                              <option key={hotel.id} value={hotel.id}>
                                {hotel.name}
                              </option>
                            ))}
                          </Select>
                        </FormField>
                      ) : (
                        <input type="hidden" name="hotelId" value={room.hotelId} />
                      )}

                      <FormField label="Room Number">
                        <Input name="number" defaultValue={room.number} required />
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
                            Active rooms can be assigned to NFC tags and used in guest ordering.
                          </span>
                        </span>
                      </label>

                      <div className="md:col-span-2">
                        <Button className="w-full">Save Room Changes</Button>
                      </div>
                    </form>
                  </Modal>
                </article>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">Locations</h2>
              <p className="text-sm text-neutral-500">
                Non-room areas such as pool, lobby, restaurant, spa, parking, or amenities.
              </p>
            </div>

            <span className="rounded-full bg-black px-4 py-2 text-sm font-black text-white">
              {locations.length}
            </span>
          </div>

          <div className="grid gap-4">
            {locations.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-neutral-200 bg-white p-8 text-center">
                <p className="font-black text-neutral-600">No locations yet</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Create your first location using Add Location.
                </p>
              </div>
            ) : null}

            {locations.map((location) => {
              const editModalId = `edit-location-${location.id}`;

              return (
                <article
                  key={location.id}
                  className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-soft"
                >
                  <div className="border-b border-neutral-100 bg-neutral-50 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-xl font-black">{location.name}</h3>
                          <StatusBadge status={location.isActive ? 'Active' : 'Inactive'} />
                        </div>

                        <p className="mt-1 text-sm font-semibold text-neutral-500">
                          {location.hotel.name} · {location.type}
                        </p>
                      </div>

                      <MapPin className="size-6 shrink-0 text-neutral-400" />
                    </div>
                  </div>

                  <div className="space-y-4 p-5">
                    <div className="grid gap-2 rounded-2xl bg-neutral-50 p-4 text-sm">
                      <p>
                        <span className="font-black">Location Name:</span>{' '}
                        <span className="font-semibold text-neutral-600">{location.name}</span>
                      </p>

                      <p>
                        <span className="font-black">Location Type:</span>{' '}
                        <span className="font-semibold text-neutral-600">{location.type}</span>
                      </p>

                      <p>
                        <span className="font-black">Linked NFC Tags:</span>{' '}
                        <span className="font-semibold text-neutral-600">
                          {location.nfcTags.length}
                        </span>
                      </p>

                      <p>
                        <span className="font-black">Description:</span>{' '}
                        <span className="font-semibold text-neutral-600">
                          {location.description || 'No description provided.'}
                        </span>
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <ModalOpenButton
                        modalId={editModalId}
                        className="gap-2 border border-neutral-200 bg-white text-black hover:bg-neutral-100"
                      >
                        <Pencil className="size-4" />
                        Edit
                      </ModalOpenButton>

                      <form action={deleteLocationAction}>
                        <input type="hidden" name="locationId" value={location.id} />
                                              <ConfirmSubmitButton
                        label="Delete"
                        message="Are you sure you want to delete this Location?"
                        className="bg-red-600 text-white hover:bg-red-700"
                      />
                      </form>
                    </div>
                  </div>

                  <Modal
                    id={editModalId}
                    title={`Edit ${location.name}`}
                    description="Update location details and availability."
                  >
                    <form action={updateLocationAction} className="grid gap-5 md:grid-cols-2">
                      <input type="hidden" name="locationId" value={location.id} />

                      {user.role === 'SUPER_ADMIN' ? (
                        <FormField label="Hotel / Property">
                          <Select name="hotelId" defaultValue={location.hotelId} required>
                            {hotels.map((hotel) => (
                              <option key={hotel.id} value={hotel.id}>
                                {hotel.name}
                              </option>
                            ))}
                          </Select>
                        </FormField>
                      ) : (
                        <input type="hidden" name="hotelId" value={location.hotelId} />
                      )}

                      <FormField label="Location Name">
                        <Input name="name" defaultValue={location.name} required />
                      </FormField>

                      <FormField label="Location Type">
                        <Select name="type" defaultValue={location.type} required>
                           {LOCATION_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </Select>
                      </FormField>

                      <FormField label="Guest-facing Description" className="md:col-span-2">
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
                            Active locations can be assigned to NFC tags and used in guest portal context.
                          </span>
                        </span>
                      </label>

                      <div className="md:col-span-2">
                        <Button className="w-full">Save Location Changes</Button>
                      </div>
                    </form>
                  </Modal>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <Modal
        id="add-room-modal"
        title="Add Room"
        description="Create a guest room that can later be connected to NFC tags."
      >
        <form action={createRoomAction} className="grid gap-5 md:grid-cols-2">
          {user.role === 'SUPER_ADMIN' ? (
            <FormField label="Hotel / Property" helper="Choose the hotel where this room belongs.">
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

          <FormField label="Room Number" helper="Example: 305, Villa 2, Suite A.">
            <Input name="number" placeholder="305" required />
          </FormField>

          <FormField label="Room Display Name" helper="Guest/staff friendly room name.">
            <Input name="name" placeholder="Deluxe Room 305" required />
          </FormField>

          <FormField label="Floor / Area" helper="Example: 3rd Floor or Beach Wing.">
            <Input name="floor" placeholder="3rd Floor" />
          </FormField>

          <div className="md:col-span-2">
            <Button className="w-full">Add Room</Button>
          </div>
        </form>
      </Modal>

      <Modal
        id="add-location-modal"
        title="Add Location"
        description="Create a non-room destination such as pool, lobby, spa, restaurant, or amenity area."
      >
        <form action={createLocationAction} className="grid gap-5 md:grid-cols-2">
          {user.role === 'SUPER_ADMIN' ? (
            <FormField label="Hotel / Property" helper="Choose the hotel where this location belongs.">
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

          <FormField label="Location Name" helper="Example: Pool Deck, Main Lobby, Rooftop Bar.">
            <Input name="name" placeholder="Pool Deck" required />
          </FormField>

          <FormField label="Location Type" helper="Controls what guest experience appears when assigned to NFC.">
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
        </form>
      </Modal>
    </div>
  );
}