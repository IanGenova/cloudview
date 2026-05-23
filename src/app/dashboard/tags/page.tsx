import { type ReactNode } from 'react';
import { TagStatus, TagType } from '@prisma/client';
import { Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { protectedGuestUrl, secureNfcLaunchUrl } from '@/lib/nfc-security';
import { ModalOpenButton } from '@/components/dashboard/ModalOpenButton';
import { DashboardSuccess } from '@/components/dashboard/DashboardSuccess';
import { ConfirmSubmitButton } from '@/components/dashboard/ConfirmSubmitButton';
import {
  createTagAction,
  deleteTagAction,
  rotateTagSecretAction,
  updateTagAction
} from './actions';

function FormField({
  label,
  helper,
  children
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
  id,
  title,
  description,
  children
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <dialog
      id={id}
      className="w-[calc(100%-1.5rem)] max-w-3xl rounded-[2rem] border border-neutral-200 bg-white p-0 shadow-2xl backdrop:bg-black/50"
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


function formatDate(date?: Date | null) {
  if (!date) return 'Never scanned';

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

export default async function TagsPage({
      searchParams
    }: {
      searchParams?: Promise<{ success?: string }>;
    }) {
  const params = await searchParams;
  const user = await requireUser();
  const where = user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

  const [hotels, rooms, locations, tags] = await Promise.all([
    db.hotel.findMany({
      where: user.role === 'SUPER_ADMIN' ? {} : { id: user.hotelId! },
      orderBy: { name: 'asc' }
    }),

        db.room.findMany({
        where: {
          ...where,
          isActive: true,
          deletedAt: null
        },
        orderBy: { number: 'asc' }
      }),

          db.location.findMany({
        where: {
          ...where,
          isActive: true,
          deletedAt: null
        },
        orderBy: { name: 'asc' }
      }),

    db.nfcTag.findMany({
      where: {
        ...where,
        deletedAt: null
      },
      include: {
        hotel: true,
        room: true,
        location: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  ]);

  return (
    <div>
      <PageHeader
        title="NFC Tag Management"
        description="Secure NFC launch sessions, tag assignment, scan tracking, edit/delete, and anti-sharing protection."
      />
                    <DashboardSuccess
              success={params?.success}
              messages={{
                'tag-created': 'NFC tag successfully added.',
                'tag-updated': 'NFC tag successfully updated.',
                'tag-deleted': 'NFC tag successfully deleted.',
                'tag-rotated': 'NFC tag secret successfully rotated. Old shared links are now invalid.'
              }}
            />

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Create NFC tag</CardTitle>
          <p className="mt-2 text-sm text-neutral-500">
            The public guest destination is protected. Guests must enter through the secure NFC launch URL.
          </p>
        </CardHeader>

        <CardContent>
          <form action={createTagAction} className="grid gap-5 md:grid-cols-3">
            {user.role === 'SUPER_ADMIN' ? (
              <FormField label="Hotel / Property" helper="Select which hotel this NFC tag belongs to.">
                <Select name="hotelId" required>
                  {hotels.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : (
              <input type="hidden" name="hotelId" value={user.hotelId!} />
            )}

            <FormField label="NFC Name" helper="Friendly staff label. Example: Room 305 Main Panel.">
              <Input name="label" placeholder="Room 305 Main Panel" required />
            </FormField>

            <FormField label="Unique Tag ID" helper="This becomes the internal tag code. Use lowercase letters, numbers, and hyphens.">
              <Input name="code" placeholder="room-305-main-panel" required />
            </FormField>

            <FormField label="Tag Type" helper="Choose where the NFC panel will be placed.">
              <Select name="tagType" required>
                {Object.values(TagType).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Assigned Room" helper="Use this for room panels.">
              <Select name="roomId">
                <option value="">No room</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    Room {r.number}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Assigned Location" helper="Use this for pool, lobby, restaurant, or amenity panels.">
              <Select name="locationId">
                <option value="">No location</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <div className="md:col-span-3">
              <Button className="w-full md:w-auto">Create Secure NFC Tag</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {tags.map((tag) => {
          const editModalId = `edit-nfc-${tag.id}`;
          const secureLaunchUrl = secureNfcLaunchUrl(tag.code, tag.scanSecret);
          const lockedDestinationUrl = protectedGuestUrl(tag.code);
          const linkedDestination = tag.room
            ? `Room ${tag.room.number}`
            : tag.location?.name || 'Unassigned';

          return (
            <article
              key={tag.id}
              className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-soft"
            >
              <div className="border-b border-neutral-100 bg-neutral-50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-xl font-black">{tag.label}</h3>
                    <p className="mt-1 text-sm font-semibold text-neutral-500">
                      {tag.hotel.name}
                    </p>
                  </div>

                  <StatusBadge status={tag.status} />
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div className="grid gap-3 rounded-2xl bg-neutral-50 p-4 text-sm">
                  <p>
                    <span className="font-black">Unique Tag ID:</span>{' '}
                    <span className="break-all font-semibold text-neutral-600">{tag.code}</span>
                  </p>

                  <p>
                    <span className="font-black">Linked Destination:</span>{' '}
                    <span className="font-semibold text-neutral-600">
                      {tag.tagType} · {linkedDestination}
                    </span>
                  </p>

                  <p>
                    <span className="font-black">Last Scanned:</span>{' '}
                    <span className="font-semibold text-neutral-600">
                      {formatDate(tag.lastScannedAt)}
                    </span>
                  </p>
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-400">
                    Protected Guest Destination
                  </p>
                  <p className="mt-2 break-all rounded-2xl bg-neutral-50 p-3 text-xs font-bold text-neutral-500">
                    {lockedDestinationUrl}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">
                    Secure NFC Launch URL
                  </p>

                  {secureLaunchUrl ? (
                    <p className="mt-2 break-all rounded-2xl bg-gold/10 p-3 text-xs font-bold text-neutral-700">
                      {secureLaunchUrl}
                    </p>
                  ) : (
                    <p className="mt-2 rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">
                      No scan secret yet. Rotate secret to generate one.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                          <ModalOpenButton
                          modalId={editModalId}
                          className="gap-2 border border-neutral-200 bg-white text-black hover:bg-neutral-100"
                        >
                          <Pencil className="size-4" />
                          Edit
                </ModalOpenButton>

                  <form action={deleteTagAction}>
                    <input type="hidden" name="tagId" value={tag.id} />
                                            <ConfirmSubmitButton
                          label="Delete"
                          message="Are you sure you want to delete this NFC tag?"
                          className="bg-red-600 text-white hover:bg-red-700"
                        />
                  </form>
                </div>

                <form action={rotateTagSecretAction}>
                  <input type="hidden" name="tagId" value={tag.id} />
                                    <ConfirmSubmitButton
                    label="Rotate Secret / Invalidate Shared Links"
                    message="Are you sure you want to rotate this NFC secret? Old NFC links will stop working."
                    className="bg-black text-white hover:bg-neutral-800"
                  />
                </form>
              </div>

              <Modal
                id={editModalId}
                title={`Edit ${tag.label}`}
                description="Update tag identity, destination, and active status."
              >
                <form action={updateTagAction} className="grid gap-5 md:grid-cols-2">
                  <input type="hidden" name="tagId" value={tag.id} />

                  {user.role === 'SUPER_ADMIN' ? (
                    <FormField label="Hotel / Property">
                      <Select name="hotelId" required defaultValue={tag.hotelId}>
                        {hotels.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  ) : (
                    <input type="hidden" name="hotelId" value={tag.hotelId} />
                  )}

                  <FormField label="Status">
                    <Select name="status" required defaultValue={tag.status}>
                      {Object.values(TagStatus).map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  <FormField label="NFC Name">
                    <Input name="label" defaultValue={tag.label} required />
                  </FormField>

                  <FormField label="Unique Tag ID">
                    <Input name="code" defaultValue={tag.code} required />
                  </FormField>

                  <FormField label="Tag Type">
                    <Select name="tagType" required defaultValue={tag.tagType}>
                      {Object.values(TagType).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  <FormField label="Assigned Room">
                    <Select name="roomId" defaultValue={tag.roomId || ''}>
                      <option value="">No room</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          Room {r.number}
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  <FormField label="Assigned Location">
                    <Select name="locationId" defaultValue={tag.locationId || ''}>
                      <option value="">No location</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  <div className="md:col-span-2">
                    <Button className="w-full">Save NFC Tag</Button>
                  </div>
                </form>
              </Modal>
            </article>
          );
        })}
      </div>
    </div>
  );
}