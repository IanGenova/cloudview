'use client';

import { useEffect, useMemo, useState } from 'react';
import { HotelGuideItemType } from '@prisma/client';
import { CheckCircle2, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import {
  createGuideItemAction,
  createGuideSectionAction,
  deleteGuideImageAction,
  deleteGuideItemAction,
  deleteGuideSectionAction,
  seedDefaultHotelGuideAction,
  updateGuideItemAction,
  updateGuideSectionAction,
  uploadGuideImageAction,
} from './actions';

type HotelOption = {
  id: string;
  name: string;
};

type GuideImage = {
  id: string;
  title: string;
  caption: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
};

type GuideItem = {
  id: string;
  sectionId: string;
  hotelId: string;
  title: string;
  subtitle: string;
  content: string;
  itemType: HotelGuideItemType;
  imageUrl: string;
  iconKey: string;
  hours: string;
  location: string;
  contact: string;
  mapUrl: string;
  buttonLabel: string;
  buttonHref: string;
  sortOrder: number;
  isActive: boolean;
  galleryImages: GuideImage[];
};

type GuideSection = {
  id: string;
  hotelId: string;
  hotelName: string;
  title: string;
  subtitle: string;
  description: string;
  imageUrl: string;
  iconKey: string;
  sortOrder: number;
  isActive: boolean;
  galleryImages: GuideImage[];
  items: GuideItem[];
};

type Message =
  | {
      type: 'success' | 'error';
      text: string;
    }
  | null;

const iconOptions = [
  'Info',
  'Wifi',
  'BedDouble',
  'Hotel',
  'MapPin',
  'Utensils',
  'Car',
  'Phone',
  'Clock',
  'Waves',
  'Search',
  'Shield',
  'HelpCircle',
];

const itemTypeOptions = Object.values(HotelGuideItemType);

function Toast({ message }: { message: Message }) {
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }

    setVisible(true);

    const timeout = window.setTimeout(() => {
      setVisible(false);
    }, 4500);

    return () => window.clearTimeout(timeout);
  }, [message?.text, message?.type]);

  if (!message || !visible) {
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

        <button
          type="button"
          onClick={() => setVisible(false)}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70 hover:bg-white"
          aria-label="Close notification"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
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
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 py-4">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-100 bg-white p-6">
          <div>
            <h2 className="text-xl font-black">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-neutral-500">{description}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-neutral-100 text-sm font-black hover:bg-neutral-200"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

function ConfirmDeleteForm({
  action,
  hiddenName,
  hiddenValue,
  label,
  confirmMessage,
}: {
  action: (formData: FormData) => void;
  hiddenName: string;
  hiddenValue: string;
  label: string;
  confirmMessage: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name={hiddenName} value={hiddenValue} />
      <button
        type="submit"
        className="h-9 w-full rounded-xl bg-red-600 text-xs font-black text-white hover:bg-red-700"
      >
        {label}
      </button>
    </form>
  );
}

function SectionFormFields({
  hotels,
  defaultHotelId,
  canChangeHotel,
  section,
}: {
  hotels: HotelOption[];
  defaultHotelId: string;
  canChangeHotel: boolean;
  section?: GuideSection;
}) {
  return (
    <>
      {!section ? (
        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Hotel
          </label>
          <Select
            name="hotelId"
            defaultValue={defaultHotelId}
            disabled={!canChangeHotel}
          >
            {hotels.map((hotel) => (
              <option key={hotel.id} value={hotel.id}>
                {hotel.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Section Title
          </label>
          <input
            name="title"
            required
            defaultValue={section?.title ?? ''}
            placeholder="Dining"
            className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Subtitle
          </label>
          <input
            name="subtitle"
            defaultValue={section?.subtitle ?? ''}
            placeholder="Explore our restaurants and bars"
            className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
          Description
        </label>
        <textarea
          name="description"
          rows={3}
          defaultValue={section?.description ?? ''}
          placeholder="Short description for this guide section."
          className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-neutral-400"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Cover Image URL
          </label>
          <input
            name="imageUrl"
            defaultValue={section?.imageUrl ?? ''}
            placeholder="https://..."
            className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Icon
          </label>
          <Select name="iconKey" defaultValue={section?.iconKey ?? 'Info'}>
            {iconOptions.map((icon) => (
              <option key={icon} value={icon}>
                {icon}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Sort Order
          </label>
          <input
            name="sortOrder"
            type="number"
            step="1"
            defaultValue={section?.sortOrder ?? 0}
            className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm font-bold">
        <input
          type="checkbox"
          name="isActive"
          value="true"
          defaultChecked={section?.isActive ?? true}
          className="size-4"
        />
        Show in Guest Portal
      </label>
    </>
  );
}

function ItemFormFields({
  sections,
  item,
}: {
  sections: GuideSection[];
  item?: GuideItem;
}) {
  return (
    <>
      {!item ? (
        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Section
          </label>
          <Select name="sectionId" defaultValue={sections[0]?.id ?? ''}>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.hotelName} · {section.title}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Item Title
          </label>
          <input
            name="title"
            required
            defaultValue={item?.title ?? ''}
            placeholder="Wi-Fi"
            className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Subtitle
          </label>
          <input
            name="subtitle"
            defaultValue={item?.subtitle ?? ''}
            placeholder="Guest internet access"
            className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
          Content
        </label>
        <textarea
          name="content"
          rows={5}
          defaultValue={item?.content ?? ''}
          placeholder="Write the guide information here."
          className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-neutral-400"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Type
          </label>
          <Select name="itemType" defaultValue={item?.itemType ?? 'INFORMATION'}>
            {itemTypeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Icon
          </label>
          <Select name="iconKey" defaultValue={item?.iconKey ?? 'Info'}>
            {iconOptions.map((icon) => (
              <option key={icon} value={icon}>
                {icon}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Sort Order
          </label>
          <input
            name="sortOrder"
            type="number"
            step="1"
            defaultValue={item?.sortOrder ?? 0}
            className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <input
          name="hours"
          defaultValue={item?.hours ?? ''}
          placeholder="Hours e.g. 7:00 AM - 9:00 PM"
          className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
        />
        <input
          name="location"
          defaultValue={item?.location ?? ''}
          placeholder="Location"
          className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
        />
        <input
          name="contact"
          defaultValue={item?.contact ?? ''}
          placeholder="Contact / Extension"
          className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
        />
        <input
          name="mapUrl"
          defaultValue={item?.mapUrl ?? ''}
          placeholder="Map URL"
          className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
        />
        <input
          name="buttonLabel"
          defaultValue={item?.buttonLabel ?? ''}
          placeholder="Button Label e.g. View Menu"
          className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
        />
        <input
          name="buttonHref"
          defaultValue={item?.buttonHref ?? ''}
          placeholder="Button Link e.g. menu, service, pool, https://..."
          className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
        />
      </div>

      <input
        name="imageUrl"
        defaultValue={item?.imageUrl ?? ''}
        placeholder="Optional cover image URL"
        className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
      />

      <label className="flex items-center gap-2 text-sm font-bold">
        <input
          type="checkbox"
          name="isActive"
          value="true"
          defaultChecked={item?.isActive ?? true}
          className="size-4"
        />
        Show in Guest Portal
      </label>
    </>
  );
}

function GalleryPreview({ images }: { images: GuideImage[] }) {
  if (!images.length) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 p-4 text-center text-xs font-bold text-neutral-400">
        No gallery images yet.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {images.map((image) => (
        <div
          key={image.id}
          className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
        >
          <div
            className="h-28 bg-neutral-100 bg-cover bg-center"
            style={{
              backgroundImage: `url(${image.imageUrl})`,
            }}
          />

          <div className="p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-black">
                {image.title || 'Gallery Image'}
              </p>

              <span
                className={
                  image.isActive
                    ? 'rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black text-emerald-700'
                    : 'rounded-full bg-neutral-100 px-2 py-1 text-[9px] font-black text-neutral-500'
                }
              >
                {image.isActive ? 'ACTIVE' : 'HIDDEN'}
              </span>
            </div>

            {image.caption ? (
              <p className="mt-1 line-clamp-2 text-[11px] text-neutral-500">
                {image.caption}
              </p>
            ) : null}

            <div className="mt-3">
              <ConfirmDeleteForm
                action={deleteGuideImageAction}
                hiddenName="imageId"
                hiddenValue={image.id}
                label="Delete Image"
                confirmMessage="Delete this hotel guide image?"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function UploadImageModal({
  sections,
  section,
  item,
  onClose,
}: {
  sections: GuideSection[];
  section?: GuideSection;
  item?: GuideItem;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Upload Hotel Guide Image"
      description="Upload brochure-style gallery photos for this Hotel Guide section or item."
      onClose={onClose}
    >
      <form action={uploadGuideImageAction} className="space-y-4">
        {item ? (
          <>
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="sectionId" value={item.sectionId} />
          </>
        ) : section ? (
          <input type="hidden" name="sectionId" value={section.id} />
        ) : (
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Section
            </label>
            <Select name="sectionId" defaultValue={sections[0]?.id ?? ''}>
              {sections.map((sectionOption) => (
                <option key={sectionOption.id} value={sectionOption.id}>
                  {sectionOption.hotelName} · {sectionOption.title}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Image File
          </label>
          <input
            name="image"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            required
            className="block w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold"
          />
          <p className="mt-1 text-xs text-neutral-500">
            JPG, PNG, or WEBP only. Maximum 4MB.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Image Title
            </label>
            <input
              name="title"
              placeholder="Pool Area"
              className="h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Sort Order
            </label>
            <input
              name="sortOrder"
              type="number"
              defaultValue="0"
              className="h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Caption
          </label>
          <textarea
            name="caption"
            rows={3}
            placeholder="Short brochure caption for guests."
            className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-bold outline-none"
          />
        </div>

        <label className="flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            name="isActive"
            value="true"
            defaultChecked
            className="size-4"
          />
          Show in Guest Portal Gallery
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50"
          >
            Cancel
          </button>

          <Button>Upload Image</Button>
        </div>
      </form>
    </Modal>
  );
}

export function HotelGuideClient({
  hotels,
  sections,
  message,
  defaultHotelId,
  canChangeHotel,
}: {
  hotels: HotelOption[];
  sections: GuideSection[];
  message: Message;
  defaultHotelId: string;
  canChangeHotel: boolean;
}) {
  const [creatingSection, setCreatingSection] = useState(false);
  const [creatingItem, setCreatingItem] = useState(false);
  const [editingSection, setEditingSection] = useState<GuideSection | null>(
    null
  );
  const [editingItem, setEditingItem] = useState<GuideItem | null>(null);
  const [uploadSection, setUploadSection] = useState<GuideSection | null>(null);
  const [uploadItem, setUploadItem] = useState<GuideItem | null>(null);

  const totalItems = useMemo(
    () => sections.reduce((sum, section) => sum + section.items.length, 0),
    [sections]
  );

  const totalImages = useMemo(
    () =>
      sections.reduce(
        (sum, section) =>
          sum +
          section.galleryImages.length +
          section.items.reduce(
            (itemSum, item) => itemSum + item.galleryImages.length,
            0
          ),
        0
      ),
    [sections]
  );

  return (
    <>
      <Toast message={message} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-xl font-black">Dynamic Hotel Guide</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Create sections, items, and brochure-style gallery images for the
            Guest Portal.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCreatingSection(true)}
            className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50"
          >
            Create Section
          </button>

          <button
            type="button"
            onClick={() => setCreatingItem(true)}
            disabled={!sections.length}
            className="h-11 rounded-2xl bg-black px-5 text-sm font-black text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create Guide Item
          </button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-3xl border border-neutral-200 bg-white p-5">
          <p className="text-sm font-bold text-neutral-500">Sections</p>
          <p className="mt-2 text-3xl font-black">{sections.length}</p>
        </div>

        <div className="rounded-3xl border border-neutral-200 bg-white p-5">
          <p className="text-sm font-bold text-neutral-500">Guide Items</p>
          <p className="mt-2 text-3xl font-black">{totalItems}</p>
        </div>

        <div className="rounded-3xl border border-neutral-200 bg-white p-5">
          <p className="text-sm font-bold text-neutral-500">Gallery Images</p>
          <p className="mt-2 text-3xl font-black">{totalImages}</p>
        </div>

        <form
          action={seedDefaultHotelGuideAction}
          className="rounded-3xl border border-neutral-200 bg-white p-5"
          onSubmit={(event) => {
            if (
              !window.confirm(
                'Add the default hotel guide sections and items?'
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="hotelId" value={defaultHotelId} />
          <p className="text-sm font-bold text-neutral-500">Starter Content</p>
          <Button className="mt-3 w-full">Seed Defaults</Button>
        </form>
      </div>

      <div className="grid gap-5">
        {sections.map((section) => (
          <Card key={section.id}>
            <CardContent>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-black">{section.title}</h3>

                    <span
                      className={
                        section.isActive
                          ? 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700'
                          : 'rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-500'
                      }
                    >
                      {section.isActive ? 'ACTIVE' : 'HIDDEN'}
                    </span>
                  </div>

                  <p className="mt-1 text-sm font-semibold text-neutral-500">
                    {section.hotelName} · {section.subtitle || 'No subtitle'}
                  </p>

                  {section.description ? (
                    <p className="mt-2 text-sm leading-6 text-neutral-600">
                      {section.description}
                    </p>
                  ) : null}

                  <p className="mt-2 text-xs font-bold text-neutral-400">
                    Icon: {section.iconKey} · Sort: {section.sortOrder}
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[360px]">
                  <button
                    type="button"
                    onClick={() => setEditingSection(section)}
                    className="h-10 rounded-2xl border border-neutral-200 px-4 text-sm font-black hover:bg-neutral-50"
                  >
                    Edit Section
                  </button>

                  <button
                    type="button"
                    onClick={() => setUploadSection(section)}
                    className="h-10 rounded-2xl bg-black px-4 text-sm font-black text-white hover:bg-neutral-800"
                  >
                    Upload Image
                  </button>

                  <ConfirmDeleteForm
                    action={deleteGuideSectionAction}
                    hiddenName="sectionId"
                    hiddenValue={section.id}
                    label="Delete Section"
                    confirmMessage="Delete this section, all guide items, and gallery images?"
                  />
                </div>
              </div>

              <div className="mt-5">
                <p className="mb-2 text-sm font-black">Section Gallery</p>
                <GalleryPreview images={section.galleryImages} />
              </div>

              <div className="mt-5 grid gap-3">
                <p className="text-sm font-black">Guide Items</p>

                {section.items.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {section.items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-3xl border border-neutral-200 bg-neutral-50 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-black">{item.title}</h4>

                              <span
                                className={
                                  item.isActive
                                    ? 'rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700'
                                    : 'rounded-full bg-neutral-200 px-2 py-1 text-[10px] font-black text-neutral-500'
                                }
                              >
                                {item.isActive ? 'ACTIVE' : 'HIDDEN'}
                              </span>
                            </div>

                            <p className="mt-1 text-xs font-bold text-neutral-500">
                              {item.itemType} · {item.subtitle || 'No subtitle'}
                            </p>
                          </div>

                          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-neutral-500">
                            Sort {item.sortOrder}
                          </span>
                        </div>

                        {item.content ? (
                          <p className="mt-3 line-clamp-3 text-sm leading-6 text-neutral-600">
                            {item.content}
                          </p>
                        ) : null}

                        <div className="mt-4 grid gap-2 sm:grid-cols-3">
                          <button
                            type="button"
                            onClick={() => setEditingItem(item)}
                            className="h-9 rounded-xl border border-neutral-200 bg-white text-xs font-black hover:bg-neutral-50"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => setUploadItem(item)}
                            className="h-9 rounded-xl bg-black text-xs font-black text-white hover:bg-neutral-800"
                          >
                            Upload Image
                          </button>

                          <ConfirmDeleteForm
                            action={deleteGuideItemAction}
                            hiddenName="itemId"
                            hiddenValue={item.id}
                            label="Delete"
                            confirmMessage="Delete this guide item and its gallery images?"
                          />
                        </div>

                        <div className="mt-4">
                          <GalleryPreview images={item.galleryImages} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-sm font-bold text-neutral-400">
                    No guide items in this section yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {!sections.length ? (
          <div className="rounded-[2rem] border border-dashed border-neutral-300 bg-white p-10 text-center">
            <p className="font-black">No Hotel Guide sections yet.</p>
            <p className="mt-1 text-sm text-neutral-500">
              Create a section or seed default content to start building the
              guest guide.
            </p>
          </div>
        ) : null}
      </div>

      {creatingSection ? (
        <Modal
          title="Create Guide Section"
          description="Add a new main section to the Guest Portal Hotel Guide."
          onClose={() => setCreatingSection(false)}
        >
          <form action={createGuideSectionAction} className="space-y-4">
            <SectionFormFields
              hotels={hotels}
              defaultHotelId={defaultHotelId}
              canChangeHotel={canChangeHotel}
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreatingSection(false)}
                className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50"
              >
                Cancel
              </button>
              <Button>Create Section</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {creatingItem ? (
        <Modal
          title="Create Guide Item"
          description="Add an information card, policy, contact, quick action, or facility item."
          onClose={() => setCreatingItem(false)}
        >
          <form action={createGuideItemAction} className="space-y-4">
            <ItemFormFields sections={sections} />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreatingItem(false)}
                className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50"
              >
                Cancel
              </button>
              <Button>Create Guide Item</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editingSection ? (
        <Modal
          title="Edit Guide Section"
          description="Update this guide section."
          onClose={() => setEditingSection(null)}
        >
          <form action={updateGuideSectionAction} className="space-y-4">
            <input type="hidden" name="sectionId" value={editingSection.id} />
            <SectionFormFields
              hotels={hotels}
              defaultHotelId={defaultHotelId}
              canChangeHotel={canChangeHotel}
              section={editingSection}
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingSection(null)}
                className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50"
              >
                Cancel
              </button>
              <Button>Save Section</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editingItem ? (
        <Modal
          title="Edit Guide Item"
          description="Update this hotel guide item."
          onClose={() => setEditingItem(null)}
        >
          <form action={updateGuideItemAction} className="space-y-4">
            <input type="hidden" name="itemId" value={editingItem.id} />
            <ItemFormFields sections={sections} item={editingItem} />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50"
              >
                Cancel
              </button>
              <Button>Save Guide Item</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {uploadSection || uploadItem ? (
        <UploadImageModal
          sections={sections}
          section={uploadSection ?? undefined}
          item={uploadItem ?? undefined}
          onClose={() => {
            setUploadSection(null);
            setUploadItem(null);
          }}
        />
      ) : null}
    </>
  );
}