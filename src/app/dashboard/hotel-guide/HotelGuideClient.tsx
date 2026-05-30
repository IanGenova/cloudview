'use client';

import { useMemo, useState } from 'react';
import { HotelGuideItemType } from '@prisma/client';
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
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
          >
            ✕
          </button>
        </div>

        {children}
      </div>
    </div>
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
        <input name="hours" defaultValue={item?.hours ?? ''} placeholder="Hours e.g. 7:00 AM - 9:00 PM" className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400" />
        <input name="location" defaultValue={item?.location ?? ''} placeholder="Location" className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400" />
        <input name="contact" defaultValue={item?.contact ?? ''} placeholder="Contact / Extension" className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400" />
        <input name="mapUrl" defaultValue={item?.mapUrl ?? ''} placeholder="Map URL" className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400" />
        <input name="buttonLabel" defaultValue={item?.buttonLabel ?? ''} placeholder="Button Label e.g. View Menu" className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400" />
        <input name="buttonHref" defaultValue={item?.buttonHref ?? ''} placeholder="Button Link e.g. menu, service, pool, https://..." className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400" />
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

function GalleryPreview({
  images,
}: {
  images: GuideImage[];
}) {
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

            <form action={deleteGuideImageAction} className="mt-3">
              <input type="hidden" name="imageId" value={image.id} />
              <button
                type="submit"
                className="h-9 w-full rounded-xl bg-red-600 text-xs font-black text-white hover:bg-red-700"
              >
                Delete Image
              </button>
            </form>
          </div>
        </div>
      ))}
    </div>
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
  const [editingSection, setEditingSection] = useState<GuideSection | null>(null);
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
      {message ? (
        <div
          className={
            message.type === 'success'
              ? 'mb-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700'
              : 'mb-5 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700'
          }
        >
          {message.text}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-xl font-black">Dynamic Hotel Guide</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Create sections, items, and brochure-style gallery images for the Guest Portal.
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
        >
          <p className="text-sm font-bold text-neutral-500">Default Setup</p>

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

          <Button className="mt-3 w-full">Add Defaults</Button>
        </form>
      </div>

      <Card>
        <CardContent>
          <h2 className="text-xl font-black">Existing Guide Content</h2>
          <p className="mt-1 text-sm text-neutral-500">
            These sections, items, and gallery images are shown dynamically in the Guest Portal.
          </p>

          <div className="mt-5 space-y-5">
            {sections.map((section) => (
              <section
                key={section.id}
                className="rounded-[2rem] border border-neutral-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black">{section.title}</h3>

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

                    <p className="mt-1 text-sm text-neutral-500">
                      {section.hotelName} · {section.subtitle || 'No subtitle'} · Sort {section.sortOrder}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setUploadSection(section)}
                      className="h-10 rounded-2xl bg-black px-4 text-sm font-black text-white hover:bg-neutral-800"
                    >
                      Upload Images
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditingSection(section)}
                      className="h-10 rounded-2xl border border-neutral-200 px-4 text-sm font-black hover:bg-neutral-50"
                    >
                      Edit Section
                    </button>

                    <form action={deleteGuideSectionAction}>
                      <input type="hidden" name="sectionId" value={section.id} />
                      <button
                        type="submit"
                        className="h-10 rounded-2xl bg-red-600 px-4 text-sm font-black text-white hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-xs font-black uppercase text-neutral-500">
                    Section Brochure Gallery
                  </p>
                  <GalleryPreview images={section.galleryImages} />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {section.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-3xl border border-neutral-200 bg-neutral-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black">{item.title}</p>
                          <p className="mt-1 text-xs font-bold text-neutral-500">
                            {item.itemType} · {item.iconKey} · Sort {item.sortOrder}
                          </p>
                        </div>

                        <span
                          className={
                            item.isActive
                              ? 'rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700'
                              : 'rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-black text-neutral-500'
                          }
                        >
                          {item.isActive ? 'ACTIVE' : 'HIDDEN'}
                        </span>
                      </div>

                      {item.content ? (
                        <p className="mt-3 line-clamp-3 text-xs leading-5 text-neutral-600">
                          {item.content}
                        </p>
                      ) : (
                        <p className="mt-3 text-xs text-neutral-400">
                          No content.
                        </p>
                      )}

                      <div className="mt-4">
                        <p className="mb-2 text-[10px] font-black uppercase text-neutral-500">
                          Item Gallery
                        </p>
                        <GalleryPreview images={item.galleryImages} />
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setUploadItem(item)}
                          className="h-10 rounded-2xl bg-black text-xs font-black text-white hover:bg-neutral-800"
                        >
                          Images
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingItem(item)}
                          className="h-10 rounded-2xl border border-neutral-200 text-sm font-black hover:bg-white"
                        >
                          Edit
                        </button>

                        <form action={deleteGuideItemAction}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <button
                            type="submit"
                            className="h-10 w-full rounded-2xl bg-red-600 text-sm font-black text-white hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}

                  {!section.items.length ? (
                    <div className="rounded-3xl border border-dashed border-neutral-300 p-5 text-center">
                      <p className="text-sm font-black">No items yet.</p>
                    </div>
                  ) : null}
                </div>
              </section>
            ))}

            {!sections.length ? (
              <div className="rounded-3xl border border-dashed border-neutral-300 p-8 text-center">
                <p className="font-black">No hotel guide content yet.</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Create a section or use the default setup button.
                </p>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {creatingSection ? (
        <Modal title="Create Guide Section" onClose={() => setCreatingSection(false)}>
          <form action={createGuideSectionAction} className="space-y-4">
            <SectionFormFields
              hotels={hotels}
              defaultHotelId={defaultHotelId}
              canChangeHotel={canChangeHotel}
            />

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCreatingSection(false)} className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50">
                Cancel
              </button>
              <Button>Create Section</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {creatingItem ? (
        <Modal title="Create Guide Item" onClose={() => setCreatingItem(false)}>
          <form action={createGuideItemAction} className="space-y-4">
            <ItemFormFields sections={sections} />

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCreatingItem(false)} className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50">
                Cancel
              </button>
              <Button>Create Item</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editingSection ? (
        <Modal title="Edit Guide Section" onClose={() => setEditingSection(null)}>
          <form action={updateGuideSectionAction} className="space-y-4">
            <input type="hidden" name="sectionId" value={editingSection.id} />
            <SectionFormFields
              hotels={hotels}
              defaultHotelId={defaultHotelId}
              canChangeHotel={canChangeHotel}
              section={editingSection}
            />

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingSection(null)} className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50">
                Cancel
              </button>
              <Button>Save Changes</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editingItem ? (
        <Modal title="Edit Guide Item" onClose={() => setEditingItem(null)}>
          <form action={updateGuideItemAction} className="space-y-4">
            <input type="hidden" name="itemId" value={editingItem.id} />
            <ItemFormFields sections={sections} item={editingItem} />

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingItem(null)} className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50">
                Cancel
              </button>
              <Button>Save Changes</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {uploadSection ? (
        <UploadImageModal
          sections={sections}
          section={uploadSection}
          onClose={() => setUploadSection(null)}
        />
      ) : null}

      {uploadItem ? (
        <UploadImageModal
          sections={sections}
          item={uploadItem}
          onClose={() => setUploadItem(null)}
        />
      ) : null}
    </>
  );
}