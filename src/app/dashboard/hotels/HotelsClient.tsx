'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  ArrowUpDown,
  BedDouble,
  Hotel,
  Link as LinkIcon,
  MoreVertical,
  Pencil,
  PlusCircle,
  RadioTower,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import {
  createHotelAction,
  deleteHotelAction,
  updateHotelAction,
} from './actions';

export type HotelRow = {
  id: string;
  name: string;
  slug: string;
  brandColor: string;
  accentColor: string;
  createdAtLabel: string;
  updatedAtLabel: string;
  rooms: number;
  orders: number;
  nfcTags: number;
  admin: {
    name: string;
    email: string;
  } | null;
};

type HotelMessage = {
  type: 'success' | 'error';
  text: string;
} | null;

type MetricCardProps = {
  label: string;
  value: string | number;
  caption: string;
  icon: typeof Hotel;
  dark?: boolean;
};

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#11100b] text-sm font-black text-white shadow-[0_14px_35px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:bg-black disabled:translate-y-0 disabled:opacity-60"
    >
      <PlusCircle className="size-4 text-[#c99c38]" />
      {pending ? 'Saving...' : children}
    </button>
  );
}

function MetricCard({
  label,
  value,
  caption,
  icon: Icon,
  dark = false,
}: MetricCardProps) {
  return (
    <div
      className={
        dark
          ? 'rounded-[1.75rem] border border-[#c99c38]/30 bg-[#11100b] p-5 text-white shadow-[0_18px_45px_rgba(0,0,0,0.18)]'
          : 'rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]'
      }
    >
      <div className="flex items-center gap-4">
        <span
          className={
            dark
              ? 'grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-[#f1c66a] via-[#c99c38] to-[#8f6820] text-[#090806]'
              : 'grid size-14 place-items-center rounded-2xl bg-[#f7f1e5] text-[#c99c38]'
          }
        >
          <Icon className="size-6" />
        </span>

        <div>
          <p
            className={
              dark
                ? 'text-xs font-black uppercase tracking-wide text-white/60'
                : 'text-xs font-black uppercase tracking-wide text-neutral-500'
            }
          >
            {label}
          </p>

          <p className="mt-1 text-3xl font-black">{value}</p>

          <p
            className={
              dark
                ? 'mt-1 text-xs font-bold text-[#f1c66a]'
                : 'mt-1 text-xs font-bold text-neutral-500'
            }
          >
            {caption}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
      <span className="size-2 rounded-full bg-emerald-500" />
      Active
    </span>
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 px-3 py-3 sm:items-center sm:px-4 sm:py-6">
      <div role="dialog" aria-modal="true" className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:rounded-[2rem]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-100 px-4 py-4 sm:px-6 sm:py-5">
          <h2 className="text-xl font-black">{title}</h2>

          <button
            type="button"
            onClick={onClose}
            className="grid size-10 place-items-center rounded-full bg-neutral-100 hover:bg-neutral-200"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

function HotelFormFields({
  hotel,
}: {
  hotel?: Pick<HotelRow, 'id' | 'name' | 'slug' | 'brandColor' | 'accentColor'>;
}) {
  return (
    <>
      {hotel ? <input type="hidden" name="hotelId" value={hotel.id} /> : null}

      <label className="grid gap-2">
        <span className="text-sm font-black text-neutral-800">Hotel Name</span>

        <div className="relative">
          <Hotel className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />

          <input
            name="name"
            defaultValue={hotel?.name ?? ''}
            placeholder="Enter hotel name"
            required
            className="h-12 w-full rounded-2xl border border-neutral-200 bg-white pl-11 pr-4 text-sm font-bold outline-none transition focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10"
          />
        </div>
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-black text-neutral-800">Hotel Slug</span>

        <div className="relative">
          <LinkIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />

          <input
            name="slug"
            defaultValue={hotel?.slug ?? ''}
            placeholder="cloud-view-demo"
            required
            className="h-12 w-full rounded-2xl border border-neutral-200 bg-white pl-11 pr-4 text-sm font-bold outline-none transition focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10"
          />
        </div>

        <span className="text-xs font-medium leading-relaxed text-neutral-500">
          Used in URLs and internal hotel references. Use lowercase letters,
          numbers, and hyphens.
        </span>
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-black text-neutral-800">Brand Color</span>

        <div className="relative">
          <span
            className="absolute left-4 top-1/2 size-5 -translate-y-1/2 rounded-lg ring-1 ring-neutral-200"
            style={{ backgroundColor: hotel?.brandColor ?? '#111111' }}
          />

          <input
            name="brandColor"
            defaultValue={hotel?.brandColor ?? ''}
            placeholder="#111111"
            className="h-12 w-full rounded-2xl border border-neutral-200 bg-white pl-12 pr-4 text-sm font-bold outline-none transition focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10"
          />
        </div>

        <span className="text-xs font-medium leading-relaxed text-neutral-500">
          Main hotel brand color. Example: #111111.
        </span>
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-black text-neutral-800">Accent Color</span>

        <div className="relative">
          <span
            className="absolute left-4 top-1/2 size-5 -translate-y-1/2 rounded-lg ring-1 ring-neutral-200"
            style={{ backgroundColor: hotel?.accentColor ?? '#B88938' }}
          />

          <input
            name="accentColor"
            defaultValue={hotel?.accentColor ?? ''}
            placeholder="#B88938"
            className="h-12 w-full rounded-2xl border border-neutral-200 bg-white pl-12 pr-4 text-sm font-bold outline-none transition focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10"
          />
        </div>

        <span className="text-xs font-medium leading-relaxed text-neutral-500">
          Secondary highlight color used for buttons, badges, and accents.
        </span>
      </label>
    </>
  );
}

function CreateHotelForm() {
  return (
    <form action={createHotelAction} className="space-y-5">
      <HotelFormFields />
      <SubmitButton>Create Hotel</SubmitButton>
    </form>
  );
}

function EditHotelModal({
  hotel,
  onClose,
}: {
  hotel: HotelRow;
  onClose: () => void;
}) {
  return (
    <Modal title="Edit Hotel" onClose={onClose}>
      <form action={updateHotelAction} className="space-y-5">
        <HotelFormFields hotel={hotel} />

        <div className="flex justify-end gap-2 border-t border-neutral-100 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            className="h-11 rounded-2xl bg-[#11100b] px-5 text-sm font-black text-white hover:bg-black"
          >
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CreateHotelModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Add Property" onClose={onClose}>
      <CreateHotelForm />
    </Modal>
  );
}

function DeleteHotelModal({
  hotel,
  onClose,
}: {
  hotel: HotelRow;
  onClose: () => void;
}) {
  return (
    <Modal title="Delete Hotel" onClose={onClose}>
      <form action={deleteHotelAction} className="space-y-5">
        <input type="hidden" name="hotelId" value={hotel.id} />

        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          This will delete <span className="font-black">{hotel.name}</span>. If
          the hotel already has connected rooms, orders, tags, or other records,
          the system will block deletion.
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-100 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            className="h-11 rounded-2xl bg-red-600 px-5 text-sm font-black text-white hover:bg-red-700"
          >
            Delete Hotel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function getInitials(name: string) {
  const parts = name
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return 'H';

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function HotelsClient({
  hotels,
  query,
  sort,
  message,
  totalHotels,
  totalRooms,
  totalOrders,
  totalNfcTags,
}: {
  hotels: HotelRow[];
  query: string;
  sort: string;
  message: HotelMessage;
  totalHotels: number;
  totalRooms: number;
  totalOrders: number;
  totalNfcTags: number;
}) {
  const [creatingHotel, setCreatingHotel] = useState(false);
  const [editingHotel, setEditingHotel] = useState<HotelRow | null>(null);
  const [deletingHotel, setDeletingHotel] = useState<HotelRow | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  async function copySlug(slug: string) {
    await navigator.clipboard.writeText(slug);
    setOpenMenuId(null);
  }

  return (
    <>
      <div className="space-y-7">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[#11100b] sm:text-4xl">
              Hotels / Properties
            </h1>

            <p className="mt-2 text-base font-medium text-neutral-500">
              Super admin controls for client hotels.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setCreatingHotel(true)}
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#11100b] px-5 text-sm font-black text-white shadow-[0_14px_35px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:bg-black"
          >
            <PlusCircle className="size-4 text-[#c99c38]" />
            Add Property
          </button>
        </section>

        {message ? (
          <div
            className={
              message.type === 'success'
                ? 'rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-800'
                : 'rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-black text-red-800'
            }
          >
            {message.text}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total Hotels"
            value={totalHotels}
            caption="Client properties"
            icon={Hotel}
          />

          <MetricCard
            label="Total Rooms"
            value={totalRooms}
            caption="Across all hotels"
            icon={BedDouble}
          />

          <MetricCard
            label="NFC Tags"
            value={totalNfcTags}
            caption="Assigned guest access tags"
            icon={RadioTower}
          />

          <MetricCard
            label="Orders"
            value={totalOrders}
            caption="All-time hotel orders"
            icon={ShoppingBag}
            dark
          />
        </section>

        <section className="grid gap-6">
  <div className="flex min-h-[620px] flex-col overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.06)]">

            <div className="border-b border-neutral-100 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black">Property Directory</h2>
                  <p className="mt-1 text-sm font-medium text-neutral-500">
                    Manage registered hotels and operational setup.
                  </p>
                </div>

                <form
                  className="flex flex-wrap items-center gap-3"
                  action="/dashboard/hotels"
                >
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />

                    <input
                      name="q"
                      defaultValue={query}
                      placeholder="Search hotels by name, slug, or admin"
                      className="h-11 w-80 rounded-2xl border border-neutral-200 bg-white pl-11 pr-4 text-sm font-bold outline-none transition focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10"
                    />
                  </div>

                  <div className="relative">
                    <ArrowUpDown className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />

                    <select
                      name="sort"
                      defaultValue={sort}
                      className="h-11 rounded-2xl border border-neutral-200 bg-white pl-11 pr-10 text-sm font-black text-neutral-700 outline-none transition focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10"
                    >
                      <option value="newest">Sort by: Newest</option>
                      <option value="oldest">Sort by: Oldest</option>
                      <option value="name-asc">Name A-Z</option>
                      <option value="name-desc">Name Z-A</option>
                      <option value="rooms-desc">Most Rooms</option>
                      <option value="orders-desc">Most Orders</option>
                      <option value="tags-desc">Most NFC Tags</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="h-11 rounded-2xl bg-[#11100b] px-5 text-sm font-black text-white transition hover:bg-black"
                  >
                    Apply
                  </button>

                  {query || sort !== 'newest' ? (
                    <Link
                      href="/dashboard/hotels"
                      className="h-11 rounded-2xl border border-neutral-200 px-5 py-3 text-sm font-black text-neutral-700 hover:bg-neutral-50"
                    >
                      Clear
                    </Link>
                  ) : null}
                </form>
              </div>
            </div>

            <div className="min-h-[390px] flex-1 overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50/70 text-xs font-black uppercase tracking-wide text-neutral-500">
                    <th className="px-6 py-4">Hotel / Property</th>
                    <th className="px-6 py-4">Hotel Admin</th>
                    <th className="px-6 py-4">Rooms</th>
                    <th className="px-6 py-4">NFC Tags</th>
                    <th className="px-6 py-4">Orders</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-neutral-100">
                  {hotels.map((hotel, index) => (
                    <tr key={hotel.id} className="transition hover:bg-[#fffaf0]">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <span
                            className={
                              index % 2 === 0
                                ? 'grid size-10 place-items-center rounded-full bg-[#11100b] text-xs font-black text-white'
                                : 'grid size-10 place-items-center rounded-full bg-gradient-to-br from-[#f1c66a] to-[#b88938] text-xs font-black text-[#11100b]'
                            }
                          >
                            {getInitials(hotel.name)}
                          </span>

                          <div className="min-w-0">
                            <p className="truncate font-black">{hotel.name}</p>
                            <p className="mt-1 truncate text-xs font-semibold text-neutral-500">
                              /{hotel.slug}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-5">
                        {hotel.admin ? (
                          <div>
                            <p className="font-bold">{hotel.admin.name}</p>
                            <p className="mt-1 text-xs font-semibold text-neutral-500">
                              {hotel.admin.email}
                            </p>
                          </div>
                        ) : (
                          <span className="text-sm font-bold text-neutral-400">
                            Not assigned
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-5 font-black">{hotel.rooms}</td>
                      <td className="px-6 py-5 font-black">{hotel.nfcTags}</td>
                      <td className="px-6 py-5 font-black">{hotel.orders}</td>

                      <td className="px-6 py-5">
                        <StatusBadge />
                      </td>

                      <td className="px-6 py-5">
                        <div className="relative flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingHotel(hotel)}
                            title="Edit hotel"
                            className="grid size-10 place-items-center rounded-2xl border border-neutral-200 text-neutral-600 transition hover:border-[#c99c38]/50 hover:bg-[#f7f1e5] hover:text-[#11100b]"
                          >
                            <Pencil className="size-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setOpenMenuId((current) =>
                                current === hotel.id ? null : hotel.id
                              )
                            }
                            title="More actions"
                            className="grid size-10 place-items-center rounded-2xl border border-neutral-200 text-neutral-600 transition hover:border-[#c99c38]/50 hover:bg-[#f7f1e5] hover:text-[#11100b]"
                          >
                            <MoreVertical className="size-4" />
                          </button>

                          {openMenuId === hotel.id ? (
                            <div className="absolute right-0 top-12 z-30 w-48 overflow-hidden rounded-2xl border border-neutral-200 bg-white p-1 shadow-2xl">
                              <button
                                type="button"
                                onClick={() => copySlug(hotel.slug)}
                                className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold hover:bg-neutral-50"
                              >
                                Copy slug
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setDeletingHotel(hotel);
                                  setOpenMenuId(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-black text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="size-4" />
                                Delete hotel
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {!hotels.length ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12">
                        <div className="rounded-3xl border border-dashed border-neutral-200 p-8 text-center">
                          <p className="text-lg font-black">No hotels found.</p>
                          <p className="mt-1 text-sm font-medium text-neutral-500">
                            Try clearing your search or create a new hotel.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-100 px-6 py-5">
              <p className="text-sm font-bold text-neutral-500">
                Showing {hotels.length ? 1 : 0} to {hotels.length} of{' '}
                {hotels.length} hotels
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled
                  className="grid size-10 place-items-center rounded-2xl border border-neutral-200 text-sm font-black text-neutral-400"
                >
                  ‹
                </button>

                <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-[#f1c66a] to-[#b88938] text-sm font-black text-[#11100b]">
                  1
                </span>

                <button
                  type="button"
                  disabled
                  className="grid size-10 place-items-center rounded-2xl border border-neutral-200 text-sm font-black text-neutral-400"
                >
                  ›
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {creatingHotel ? (
        <CreateHotelModal onClose={() => setCreatingHotel(false)} />
      ) : null}

      {editingHotel ? (
        <EditHotelModal
          hotel={editingHotel}
          onClose={() => setEditingHotel(null)}
        />
      ) : null}

      {deletingHotel ? (
        <DeleteHotelModal
          hotel={deletingHotel}
          onClose={() => setDeletingHotel(null)}
        />
      ) : null}
    </>
  );
}