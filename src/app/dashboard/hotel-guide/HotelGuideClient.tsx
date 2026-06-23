'use client';

import {
  type ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HotelGuideItemType } from '@prisma/client';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Layers,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
  Maximize2,

} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import {
  createGuideItemAction,
  createGuideSectionAction,
  deleteGuideImageAction,
  deleteGuideItemAction,
  deleteGuideSectionAction,
  seedDefaultHotelGuideAction,
  seedPoolGuideContentAction,
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

  panoramaEnabled: boolean;
  panoramaImageUrl: string;

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

  panoramaEnabled: boolean;
  panoramaImageUrl: string;

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
  'Sparkles',
'ShieldCheck',
'Clock3',
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

function CoverPhotoField({
  imageUrl,
  label,
}: {
  imageUrl?: string;
  label: string;
}) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleCoverImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setPreviewUrl('');
    setFileName('');
    setError('');

    if (!file) {
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxFileSize = 4 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      event.target.value = '';
      setError('Use JPG, PNG, or WEBP only.');
      return;
    }

    if (file.size > maxFileSize) {
      event.target.value = '';
      setError('Cover photo must be 4MB or smaller.');
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    setFileName(file.name);
  }

  const displayImageUrl = previewUrl || imageUrl || '';

  return (
    <div className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4">
      <label className="mb-3 block text-xs font-black uppercase text-neutral-500">
        {label}
      </label>

      <div className="grid gap-4 md:grid-cols-[180px_1fr]">
        <div className="flex h-32 items-center justify-center overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {displayImageUrl ? (
            <img
              src={displayImageUrl}
              alt={label}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center text-neutral-400">
              <ImageIcon className="size-8" />
              <span className="mt-2 text-xs font-black">No cover yet</span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <input
              name="coverImage"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleCoverImageChange}
              className="block w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold transition file:mr-4 file:rounded-xl file:border-0 file:bg-[#11100b] file:px-4 file:py-2 file:text-sm file:font-black file:text-white hover:border-[#c99c38]/50"
            />

            <p className="mt-1 text-xs font-bold text-neutral-500">
              Uploading a file will replace the cover image URL below. JPG, PNG,
              or WEBP only. Max 4MB.
            </p>

            {fileName ? (
              <p className="mt-2 text-xs font-black text-[#9d741f]">
                Selected: {fileName}
              </p>
            ) : null}

            {error ? (
              <p className="mt-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-black text-red-700">
                {error}
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Or Paste Cover Image URL
            </label>
            <input
              name="imageUrl"
              defaultValue={imageUrl ?? ''}
              placeholder="https://..."
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PanoramaField({
  enabled,
  panoramaImageUrl,
  label,
}: {
  enabled?: boolean;
  panoramaImageUrl?: string;
  label: string;
}) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handlePanoramaChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setPreviewUrl('');
    setFileName('');
    setError('');

    if (!file) {
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxFileSize = 12 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      event.target.value = '';
      setError('Use JPG, PNG, or WEBP only.');
      return;
    }

    if (file.size > maxFileSize) {
      event.target.value = '';
      setError('360° panorama must be 12MB or smaller.');
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    setFileName(file.name);
  }

  const displayImageUrl = previewUrl || panoramaImageUrl || '';

  return (
    <div className="rounded-[1.5rem] border border-[#c99c38]/30 bg-[#fffaf0] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <label className="block text-xs font-black uppercase tracking-wide text-[#9d741f]">
            {label}
          </label>
          <p className="mt-1 text-xs font-bold text-neutral-500">
            Use a 2:1 equirectangular image, example: 6000×3000 or 4000×2000.
          </p>
        </div>

        <label className="inline-flex items-center gap-2 rounded-full border border-[#c99c38]/40 bg-white px-3 py-2 text-xs font-black text-neutral-800">
          <input
            type="checkbox"
            name="panoramaEnabled"
            value="true"
            defaultChecked={enabled ?? false}
            className="size-4 accent-black"
          />
          Enable 360°
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div className="flex h-36 items-center justify-center overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {displayImageUrl ? (
            <img
              src={displayImageUrl}
              alt={label}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center text-neutral-400">
              <ImageIcon className="size-8" />
              <span className="mt-2 text-xs font-black">No 360° image</span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <input
              name="panoramaImage"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handlePanoramaChange}
              className="block w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold transition file:mr-4 file:rounded-xl file:border-0 file:bg-[#11100b] file:px-4 file:py-2 file:text-sm file:font-black file:text-white hover:border-[#c99c38]/50"
            />

            <p className="mt-1 text-xs font-bold text-neutral-500">
              Uploading a file will replace the 360° URL below.
            </p>

            {fileName ? (
              <p className="mt-2 text-xs font-black text-[#9d741f]">
                Selected: {fileName}
              </p>
            ) : null}

            {error ? (
              <p className="mt-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-black text-red-700">
                {error}
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Or Paste 360° Panorama URL
            </label>
            <input
              name="panoramaImageUrl"
              defaultValue={panoramaImageUrl ?? ''}
              placeholder="https://yourdomain.com/pool-360.jpg"
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
            />
          </div>
        </div>
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

             <CoverPhotoField
  imageUrl={section?.imageUrl ?? ''}
  label="Section Cover Photo"
/>
        <PanoramaField
          enabled={section?.panoramaEnabled ?? false}
          panoramaImageUrl={section?.panoramaImageUrl ?? ''}
          label="Section 360° Panorama"
        />

          <div className="grid gap-3 md:grid-cols-2">
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
  defaultSectionId,
}: {
  sections: GuideSection[];
  item?: GuideItem;
  defaultSectionId?: string;
}) {
  return (
    <>
      {!item ? (
        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Section
          </label>
          <Select
            name="sectionId"
            defaultValue={defaultSectionId ?? sections[0]?.id ?? ''}
          >
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
            <div>
              <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                Hours
              </label>
              <input
                name="hours"
                defaultValue={item?.hours ?? ''}
                placeholder="e.g. 7:00 AM - 9:00 PM"
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                Location
              </label>
              <input
                name="location"
                defaultValue={item?.location ?? ''}
                placeholder="e.g. Pool Deck, Ground Floor, Lobby"
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                Contact / Extension
              </label>
              <input
                name="contact"
                defaultValue={item?.contact ?? ''}
                placeholder="e.g. Front Desk 0, Housekeeping 102"
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                Map URL
              </label>
              <input
                name="mapUrl"
                defaultValue={item?.mapUrl ?? ''}
                placeholder="Paste Google Maps or internal location link"
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                Button Label
              </label>
              <input
                name="buttonLabel"
                defaultValue={item?.buttonLabel ?? ''}
                placeholder="e.g. View Menu, Request Service, Open Pool Page"
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                Button Link
              </label>
              <input
                name="buttonHref"
                defaultValue={item?.buttonHref ?? ''}
                placeholder="e.g. menu, service, pool, https://..."
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Cover Image URL
            </label>
                          <CoverPhotoField
                imageUrl={item?.imageUrl ?? ''}
                label="Guide Item Cover Photo"
              />
            </div>

            <PanoramaField
              enabled={item?.panoramaEnabled ?? false}
              panoramaImageUrl={item?.panoramaImageUrl ?? ''}
              label="Guide Item 360° Panorama"
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
 const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [previews, setPreviews] = useState<
      {
        id: string;
        name: string;
        sizeLabel: string;
        url: string;
        file: File;
      }[]
    >([]);

    const [previewError, setPreviewError] = useState('');
    const [selectedPreview, setSelectedPreview] = useState<{
      title?: string;
      caption?: string;
      imageUrl: string;
    } | null>(null);

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  function formatFileSize(size: number) {
    if (size < 1024 * 1024) {
      return `${Math.max(1, Math.round(size / 1024))} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }

  function syncInputFiles(nextPreviews: typeof previews) {
  if (!fileInputRef.current) {
    return;
  }

  const dataTransfer = new DataTransfer();

  nextPreviews.forEach((preview) => {
    dataTransfer.items.add(preview.file);
  });

  fileInputRef.current.files = dataTransfer.files;
}

function clearPreviews() {
  previews.forEach((preview) => URL.revokeObjectURL(preview.url));
  setPreviews([]);
  setPreviewError('');

  if (fileInputRef.current) {
    fileInputRef.current.value = '';
  }
}



function removePreview(previewId: string) {
  const removedPreview = previews.find((preview) => preview.id === previewId);
  const nextPreviews = previews.filter((preview) => preview.id !== previewId);

  if (removedPreview) {
    URL.revokeObjectURL(removedPreview.url);
  }

  setPreviews(nextPreviews);
  syncInputFiles(nextPreviews);

  if (!nextPreviews.length && fileInputRef.current) {
    fileInputRef.current.value = '';
  }
}

function handleImagesChange(event: ChangeEvent<HTMLInputElement>) {
  const files = Array.from(event.target.files ?? []);

  previews.forEach((preview) => URL.revokeObjectURL(preview.url));

  setPreviews([]);
  setPreviewError('');

  if (!files.length) {
    return;
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const maxFileSize = 4 * 1024 * 1024;
  const maxFiles = 10;

  if (files.length > maxFiles) {
    event.target.value = '';
    setPreviewError(`You can upload up to ${maxFiles} images at once.`);
    return;
  }

  const invalidFile = files.find((file) => !allowedTypes.includes(file.type));

  if (invalidFile) {
    event.target.value = '';
    setPreviewError(
      `${invalidFile.name} is not allowed. Use JPG, PNG, or WEBP only.`
    );
    return;
  }

  const oversizedFile = files.find((file) => file.size > maxFileSize);

  if (oversizedFile) {
    event.target.value = '';
    setPreviewError(`${oversizedFile.name} is larger than 4MB.`);
    return;
  }

  const nextPreviews = files.map((file, index) => ({
    id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
    name: file.name,
    sizeLabel: formatFileSize(file.size),
    url: URL.createObjectURL(file),
    file,
  }));

  setPreviews(nextPreviews);
  syncInputFiles(nextPreviews);
}

  const uploadTargetLabel = item
    ? `Guide Item: ${item.title}`
    : section
      ? `Section: ${section.title}`
      : 'Selected section';

  return (
    <Modal
      title="Upload Hotel Guide Images"
      description="Upload one or more brochure-style gallery photos for this Hotel Guide section or item."
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

        <div className="rounded-2xl border border-[#c99c38]/20 bg-[#fffaf0] px-4 py-3">
          <p className="text-xs font-black uppercase tracking-wide text-[#9d741f]">
            Upload Target
          </p>
          <p className="mt-1 text-sm font-black text-neutral-800">
            {uploadTargetLabel}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Image Files
          </label>

          <input
            ref={fileInputRef}
            name="images"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            required
            onChange={handleImagesChange}
            className="block w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold transition file:mr-4 file:rounded-xl file:border-0 file:bg-[#11100b] file:px-4 file:py-2 file:text-sm file:font-black file:text-white hover:border-[#c99c38]/50"
          />

          <p className="mt-1 text-xs text-neutral-500">
            Select up to 10 images. JPG, PNG, or WEBP only. Maximum 4MB per
            image.
          </p>

          {previewError ? (
            <p className="mt-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-black text-red-700">
              {previewError}
            </p>
          ) : null}
        </div>

        {previews.length ? (
          <div className="overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-neutral-500">
                  Image Preview
                </p>
                <p className="mt-1 text-sm font-black text-neutral-800">
                  {previews.length} image{previews.length === 1 ? '' : 's'}{' '}
                  selected
                </p>
              </div>

              <button
                type="button"
                onClick={clearPreviews}
                className="h-9 rounded-2xl border border-neutral-200 px-4 text-xs font-black hover:bg-neutral-50"
              >
                Clear Preview
              </button>
            </div>

            <div className="grid gap-3 bg-neutral-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
             {previews.map((preview) => (
                    <div
                      key={preview.id}
                      className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedPreview({
                            title: preview.name,
                            imageUrl: preview.url,
                          })
                        }
                        className="block w-full"
                      >
                        <div className="relative flex h-40 items-center justify-center bg-neutral-100">
                          <img
                            src={preview.url}
                            alt={preview.name}
                            className="h-full w-full object-cover"
                          />

                          <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/25" />

                          <span className="absolute left-3 top-3 grid size-8 place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
                            <Maximize2 className="size-4" />
                          </span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => removePreview(preview.id)}
                        className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-red-600 text-white shadow-lg transition hover:bg-red-700"
                        title="Remove from upload"
                        aria-label="Remove from upload"
                      >
                        <X className="size-4" />
                      </button>

                      <div className="p-3">
                        <p className="truncate text-xs font-black text-neutral-800">
                          {preview.name}
                        </p>
                        <p className="mt-1 text-xs font-bold text-neutral-500">
                          {preview.sizeLabel}
                        </p>
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
            <p className="text-sm font-black text-neutral-600">
              No images selected yet.
            </p>
            <p className="mt-1 text-xs font-bold text-neutral-400">
              Choose multiple image files to preview them before uploading.
            </p>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Base Image Title
            </label>
            <input
              name="title"
              placeholder="Pool Area"
              className="h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold outline-none focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10"
            />
            <p className="mt-1 text-xs text-neutral-500">
              For multiple images, the system will append a number to this
              title.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Starting Sort Order
            </label>
            <input
              name="sortOrder"
              type="number"
              defaultValue={0}
              className="h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold outline-none focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Each next image increases the sort order by 1.
            </p>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Caption
          </label>
          <textarea
            name="caption"
            rows={3}
            placeholder="Short caption for these images"
            className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-bold outline-none focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10"
          />
          <p className="mt-1 text-xs text-neutral-500">
            The same caption will be applied to all selected images.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            name="isActive"
            value="true"
            defaultChecked
            className="size-4 accent-black"
          />
          Show in Guest Portal Gallery
        </label>

        <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50"
          >
            Cancel
          </button>

          <Button>
            {previews.length > 1
              ? `Upload ${previews.length} Images`
              : 'Upload Image'}
          </Button>
        </div>
      </form>
              {selectedPreview ? (
              <ImageLightbox
                image={selectedPreview}
                onClose={() => setSelectedPreview(null)}
              />
            ) : null}
    </Modal>
  );
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'HIDDEN';
type SortMode = 'custom' | 'title-asc' | 'items-desc';
type ViewMode = 'sections' | 'items';

function StatusPill({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={
        isActive
          ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700'
          : 'inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-black uppercase text-neutral-500'
      }
    >
      <span
        className={
          isActive
            ? 'size-1.5 rounded-full bg-emerald-500'
            : 'size-1.5 rounded-full bg-neutral-400'
        }
      />
      {isActive ? 'Active' : 'Hidden'}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  description: string;
  icon: typeof Layers;
}) {
  return (
    <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-4">
        <span className="grid size-13 place-items-center rounded-2xl bg-[#f7f1e5] text-[#c99c38]">
          <Icon className="size-6" />
        </span>

        <div>
          <p className="text-xs font-black uppercase tracking-wide text-neutral-500">
            {label}
          </p>
          <p className="mt-1 text-3xl font-black">{value}</p>
          <p className="mt-1 text-xs font-bold text-neutral-500">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

function ImageLightbox({
  image,
  onClose,
}: {
  image: {
    title?: string;
    caption?: string;
    imageUrl: string;
  };
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-5 top-5 grid size-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
        aria-label="Close full screen preview"
      >
        <X className="size-5" />
      </button>

      <div className="flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] bg-black shadow-2xl">
        <div className="min-h-0 flex-1 bg-black">
          <img
            src={image.imageUrl}
            alt={image.title || 'Hotel guide image'}
            className="max-h-[80dvh] w-full object-contain"
          />
        </div>

        {(image.title || image.caption) ? (
          <div className="border-t border-white/10 bg-black px-5 py-4 text-white">
            {image.title ? (
              <p className="text-sm font-black">{image.title}</p>
            ) : null}

            {image.caption ? (
              <p className="mt-1 text-sm leading-6 text-white/70">
                {image.caption}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ConfirmDeleteDialog({
  title,
  message,
  action,
  hiddenName,
  hiddenValue,
  confirmLabel = 'Delete',
  onClose,
}: {
  title: string;
  message: string;
  action: (formData: FormData) => void | Promise<void>;
  hiddenName: string;
  hiddenValue: string;
  confirmLabel?: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-start gap-4 border-b border-neutral-100 p-6">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-red-50 text-red-600">
            <AlertTriangle className="size-6" />
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black text-neutral-950">{title}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-neutral-600">
              {message}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-600 transition hover:bg-neutral-200"
            aria-label="Close confirmation"
          >
            <X className="size-4" />
          </button>
        </div>

        <form action={action} className="flex justify-end gap-2 p-5">
          <input type="hidden" name={hiddenName} value={hiddenValue} />

          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black text-neutral-700 transition hover:bg-neutral-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            className="h-11 rounded-2xl bg-red-600 px-5 text-sm font-black text-white transition hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </form>
      </div>
    </div>
  );
}

function GalleryImageDeleteButton({
  imageId,
  imageTitle,
}: {
  imageId: string;
  imageTitle?: string;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmingDelete(true)}
        className="grid size-8 place-items-center rounded-full bg-red-600 text-white shadow-lg transition hover:bg-red-700"
        title="Delete image"
        aria-label="Delete image"
      >
        <Trash2 className="size-4" />
      </button>

      {confirmingDelete ? (
        <ConfirmDeleteDialog
          title="Delete Hotel Guide Image"
          message={`Are you sure you want to delete ${
            imageTitle ? `"${imageTitle}"` : 'this image'
          }? This action cannot be undone.`}
          action={deleteGuideImageAction}
          hiddenName="imageId"
          hiddenValue={imageId}
          confirmLabel="Delete Image"
          onClose={() => setConfirmingDelete(false)}
        />
      ) : null}
    </>
  );
}

function MiniGallery({ images }: { images: GuideImage[] }) {
  const [selectedImage, setSelectedImage] = useState<GuideImage | null>(null);

  if (!images.length) {
    return null;
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
        {images.slice(0, 6).map((image) => (
          <div
            key={image.id}
            className="group relative size-20 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 shadow-sm"
          >
            <button
              type="button"
              onClick={() => setSelectedImage(image)}
              className="block size-full bg-cover bg-center"
              style={{
                backgroundImage: `url(${image.imageUrl})`,
              }}
              title={image.title || 'Open image'}
              aria-label="Open image in full screen"
            >
              <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/25" />

              <span className="absolute left-2 top-2 grid size-7 place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
                <Maximize2 className="size-3.5" />
              </span>
            </button>

            <div className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100">
              <GalleryImageDeleteButton imageId={image.id} />
            </div>
          </div>
        ))}

        {images.length > 6 ? (
          <button
            type="button"
            onClick={() => setSelectedImage(images[6])}
            className="grid size-20 place-items-center rounded-2xl border border-neutral-200 bg-neutral-50 text-xs font-black text-neutral-500 transition hover:border-[#c99c38]/50 hover:bg-[#fffaf0]"
          >
            +{images.length - 6}
          </button>
        ) : null}
      </div>

      {selectedImage ? (
        <ImageLightbox
          image={selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      ) : null}
    </>
  );
}

function InlineDeleteForm({
  action,
  hiddenName,
  hiddenValue,
  label,
  confirmMessage,
}: {
  action: (formData: FormData) => void | Promise<void>;
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
        className="inline-flex h-10 items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 text-xs font-black text-red-600 transition hover:border-red-200 hover:bg-red-100"
      >
        <Trash2 className="size-4" />
        {label}
      </button>
    </form>
  );
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function sectionMatches(section: GuideSection, query: string) {
  if (!query) {
    return true;
  }

  const sectionText = [
    section.title,
    section.subtitle,
    section.description,
    section.hotelName,
    section.iconKey,
  ]
    .join(' ')
    .toLowerCase();

  const itemText = section.items
    .map((item) =>
      [
        item.title,
        item.subtitle,
        item.content,
        item.itemType,
        item.hours,
        item.location,
        item.contact,
      ].join(' ')
    )
    .join(' ')
    .toLowerCase();

  return sectionText.includes(query) || itemText.includes(query);
}

function itemMatches(item: GuideItem, query: string) {
  if (!query) {
    return true;
  }

  return [
    item.title,
    item.subtitle,
    item.content,
    item.itemType,
    item.hours,
    item.location,
    item.contact,
  ]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

function statusMatches(isActive: boolean, status: StatusFilter) {
  if (status === 'ACTIVE') {
    return isActive;
  }

  if (status === 'HIDDEN') {
    return !isActive;
  }

  return true;
}

function getSectionImageCount(section: GuideSection) {
  return (
    section.galleryImages.length +
    section.items.reduce(
      (sum, item) => sum + item.galleryImages.length,
      0
    )
  );
}

function sortSections(sections: GuideSection[], sortMode: SortMode) {
  const nextSections = [...sections];

  if (sortMode === 'title-asc') {
    return nextSections.sort((a, b) => a.title.localeCompare(b.title));
  }

  if (sortMode === 'items-desc') {
    return nextSections.sort((a, b) => b.items.length - a.items.length);
  }

  return nextSections.sort((a, b) => a.sortOrder - b.sortOrder);
}

function GuideItemRow({
  item,
  sectionTitle,
  onEdit,
  onUpload,
}: {
  item: GuideItem;
  sectionTitle?: string;
  onEdit: (item: GuideItem) => void;
  onUpload: (item: GuideItem) => void;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-[#c99c38]/40 hover:bg-[#fffaf0]">
      <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="size-2 rounded-full bg-[#c99c38]" />

            <h4 className="font-black">{item.title}</h4>

            <StatusPill isActive={item.isActive} />

            <span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-black uppercase text-neutral-500">
              Sort {item.sortOrder}
            </span>
          </div>

          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-neutral-500">
            {sectionTitle ? `${sectionTitle} · ` : ''}
            {item.itemType}
          </p>

          <p className="mt-1 text-sm font-semibold text-neutral-600">
            {item.subtitle || 'No subtitle'}
          </p>

          {item.content ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-500">
              {item.content}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-neutral-400">
            {item.hours ? <span>Hours: {item.hours}</span> : null}
            {item.location ? <span>Location: {item.location}</span> : null}
            {item.buttonHref ? <span>Link: {item.buttonHref}</span> : null}
          </div>

          <MiniGallery images={item.galleryImages} />
        </div>

        <div className="flex flex-wrap gap-2 xl:justify-end">
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-neutral-200 px-4 text-xs font-black transition hover:border-[#c99c38]/50 hover:bg-[#f7f1e5]"
          >
            <Pencil className="size-4" />
            Edit
          </button>

          <button
            type="button"
            onClick={() => onUpload(item)}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-[#11100b] px-4 text-xs font-black text-white transition hover:bg-black"
          >
            <Upload className="size-4 text-[#c99c38]" />
            Upload Image
          </button>

          <InlineDeleteForm
            action={deleteGuideItemAction}
            hiddenName="itemId"
            hiddenValue={item.id}
            label="Delete"
            confirmMessage="Delete this guide item and its gallery images?"
          />
        </div>
      </div>
    </div>
  );
}

function SectionAccordionRow({
  section,
  visibleItems,
  expanded,
  onToggle,
  onEditSection,
  onUploadSection,
  onCreateItem,
  onEditItem,
  onUploadItem,
}: {
  section: GuideSection;
  visibleItems: GuideItem[];
  expanded: boolean;
  onToggle: () => void;
  onEditSection: (section: GuideSection) => void;
  onUploadSection: (section: GuideSection) => void;
  onCreateItem: (sectionId: string) => void;
  onEditItem: (item: GuideItem) => void;
  onUploadItem: (item: GuideItem) => void;
}) {
  const imageCount = getSectionImageCount(section);

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white shadow-[0_14px_35px_rgba(0,0,0,0.04)]">
      <div className="grid gap-4 p-5 xl:grid-cols-[1fr_auto] xl:items-center">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 items-start gap-4 text-left"
        >
          <span className="mt-1 grid size-10 shrink-0 place-items-center rounded-2xl bg-[#f7f1e5] text-[#c99c38]">
            {expanded ? (
              <ChevronDown className="size-5" />
            ) : (
              <ChevronRight className="size-5" />
            )}
          </span>

          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-black">{section.title}</span>
              <StatusPill isActive={section.isActive} />
            </span>

            <span className="mt-1 block text-sm font-semibold text-neutral-500">
              {section.subtitle || 'No subtitle'}
            </span>

            <span className="mt-2 flex flex-wrap gap-3 text-xs font-bold text-neutral-400">
              <span>{section.hotelName}</span>
              <span>{section.items.length} items</span>
              <span>{imageCount} images</span>
              <span>Sort {section.sortOrder}</span>
            </span>
          </span>
        </button>

        <div className="flex flex-wrap gap-2 xl:justify-end">
          <button
            type="button"
            onClick={() => onEditSection(section)}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-neutral-200 px-4 text-xs font-black transition hover:border-[#c99c38]/50 hover:bg-[#f7f1e5]"
          >
            <Pencil className="size-4" />
            Edit Section
          </button>

          <button
            type="button"
            onClick={() => onUploadSection(section)}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-[#11100b] px-4 text-xs font-black text-white transition hover:bg-black"
          >
            <Upload className="size-4 text-[#c99c38]" />
            Upload Images
          </button>

          <InlineDeleteForm
            action={deleteGuideSectionAction}
            hiddenName="sectionId"
            hiddenValue={section.id}
            label="Delete"
            confirmMessage="Delete this section, all guide items, and gallery images?"
          />
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-neutral-100 bg-neutral-50/60 p-5">
          {section.description ? (
            <p className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 text-sm leading-6 text-neutral-600">
              {section.description}
            </p>
          ) : null}

          <MiniGallery images={section.galleryImages} />

          <div className="mt-4 rounded-2xl border border-neutral-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
              <div>
                <p className="text-sm font-black">
                  Guide Items ({visibleItems.length})
                </p>
                <p className="mt-1 text-xs font-bold text-neutral-500">
                  Items shown inside this section in the Guest Portal.
                </p>
              </div>

              <button
                type="button"
                onClick={() => onCreateItem(section.id)}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#c99c38]/40 bg-[#fffaf0] px-4 text-xs font-black text-[#9d741f] transition hover:border-[#c99c38] hover:bg-[#f7f1e5]"
              >
                <Plus className="size-4" />
                Add Guide Item
              </button>
            </div>

            <div className="space-y-3 p-4">
              {visibleItems.map((item) => (
                <GuideItemRow
                  key={item.id}
                  item={item}
                  onEdit={onEditItem}
                  onUpload={onUploadItem}
                />
              ))}

              {!visibleItems.length ? (
                <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
                  <p className="font-black">No matching guide items.</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Add a new item or adjust your search/filter.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
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
  const [defaultItemSectionId, setDefaultItemSectionId] = useState<
    string | undefined
  >(undefined);

  const [editingSection, setEditingSection] = useState<GuideSection | null>(
    null
  );
  const [editingItem, setEditingItem] = useState<GuideItem | null>(null);
  const [uploadSection, setUploadSection] = useState<GuideSection | null>(null);
  const [uploadItem, setUploadItem] = useState<GuideItem | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sortMode, setSortMode] = useState<SortMode>('custom');
  const [viewMode, setViewMode] = useState<ViewMode>('sections');

  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(
    () => new Set(sections[0]?.id ? [sections[0].id] : [])
  );

  useEffect(() => {
    setExpandedSectionIds((current) => {
      const existingIds = new Set(sections.map((section) => section.id));
      const next = new Set(
        Array.from(current).filter((id) => existingIds.has(id))
      );

      if (!next.size && sections[0]?.id) {
        next.add(sections[0].id);
      }

      return next;
    });
  }, [sections]);

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

  const normalizedQuery = normalizeSearch(searchQuery);

  const visibleSections = useMemo(() => {
    const filtered = sections.filter((section) => {
      return (
        statusMatches(section.isActive, statusFilter) &&
        sectionMatches(section, normalizedQuery)
      );
    });

    return sortSections(filtered, sortMode);
  }, [sections, normalizedQuery, statusFilter, sortMode]);

  const flatVisibleItems = useMemo(() => {
    return visibleSections.flatMap((section) =>
      section.items
        .filter((item) => {
          return (
            statusMatches(item.isActive, statusFilter) &&
            itemMatches(item, normalizedQuery)
          );
        })
        .map((item) => ({
          section,
          item,
        }))
    );
  }, [visibleSections, normalizedQuery, statusFilter]);

  function openCreateItem(sectionId?: string) {
    setDefaultItemSectionId(sectionId);
    setCreatingItem(true);
  }

  function closeCreateItem() {
    setCreatingItem(false);
    setDefaultItemSectionId(undefined);
  }

  function toggleSection(sectionId: string) {
    setExpandedSectionIds((current) => {
      const next = new Set(current);

      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }

      return next;
    });
  }

  return (
    <>
      <Toast message={message} />

      <div className="space-y-6">
  <section className="overflow-hidden rounded-[2.5rem] border border-[#c99c38]/25 bg-[#11100b] text-white shadow-[0_24px_70px_rgba(0,0,0,0.18)]">
    <div className="relative p-6">
      <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-[#c99c38]/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-10 size-64 rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="relative z-10 grid gap-6 xl:grid-cols-[1fr_auto] xl:items-end">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-[#c99c38]/35 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#f1c66a]">
            <Sparkles className="size-4" />
            Guest Portal CMS
          </p>

          <h2 className="mt-5 max-w-2xl text-4xl font-black tracking-tight">
            Hotel Guide Builder
          </h2>

          <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-white/60">
            Build the guest-facing guide in a simple flow: create sections,
            add guide items, upload photos, and publish them to the Guest Portal.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setCreatingSection(true)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#d6a738] px-5 py-3 text-sm font-black text-black shadow-[0_16px_35px_rgba(214,167,56,0.25)] transition hover:bg-[#f1c66a]"
          >
            <Plus className="size-4" />
            Create Section
          </button>

          <button
            type="button"
            onClick={() => openCreateItem()}
            disabled={!sections.length}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-4 text-[#d6a738]" />
            Create Guide Item
          </button>
        </div>
      </div>
    </div>

    <div className="grid border-t border-white/10 bg-black/20 sm:grid-cols-3">
      <div className="border-b border-white/10 p-5 sm:border-b-0 sm:border-r">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d6a738]">
          Step 1
        </p>
        <p className="mt-1 font-black">Create Sections</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-white/45">
          Example: Dining, Pool, Wi-Fi, Rules, Transportation.
        </p>
      </div>

      <div className="border-b border-white/10 p-5 sm:border-b-0 sm:border-r">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d6a738]">
          Step 2
        </p>
        <p className="mt-1 font-black">Add Guide Items</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-white/45">
          Add content, hours, location, contact, buttons, and links.
        </p>
      </div>

      <div className="p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d6a738]">
          Step 3
        </p>
        <p className="mt-1 font-black">Upload Photos</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-white/45">
          Add gallery photos and 360° images for richer guest browsing.
        </p>
      </div>
    </div>
  </section>

  <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    <SummaryCard
      label="Sections"
      value={sections.length}
      description="Main guide categories"
      icon={Layers}
    />

    <SummaryCard
      label="Guide Items"
      value={totalItems}
      description="Information cards and actions"
      icon={FileText}
    />

    <SummaryCard
      label="Gallery Images"
      value={totalImages}
      description="Section and item photos"
      icon={ImageIcon}
    />

    <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-4">
        <span className="grid size-13 place-items-center rounded-2xl bg-[#f7f1e5] text-[#c99c38]">
          <Sparkles className="size-6" />
        </span>

        <div>
          <p className="text-xs font-black uppercase tracking-wide text-neutral-500">
            Starter Templates
          </p>
          <p className="mt-1 text-sm font-bold text-neutral-500">
            Quickly generate default guide content.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <form
          action={seedDefaultHotelGuideAction}
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
          <Button className="w-full">Seed Default Guide</Button>
        </form>

        <form
          action={seedPoolGuideContentAction}
          onSubmit={(event) => {
            if (
              !window.confirm(
                'Add or update the dynamic Pool & Amenities content?'
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="hotelId" value={defaultHotelId} />
          <button
            type="submit"
            className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-5 text-sm font-black transition hover:border-[#c99c38]/50 hover:bg-[#fffaf0]"
          >
            Seed / Update Pool Guide
          </button>
        </form>
      </div>
    </div>
  </section>

  <section className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
    <div className="border-b border-neutral-100 bg-neutral-50/70 p-5">
      <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#c99c38]">
            Content Workspace
          </p>

          <h3 className="mt-1 text-2xl font-black">
            Manage Guest Portal Guide
          </h3>

          <p className="mt-1 text-sm font-medium text-neutral-500">
            Use Sections View for structure. Use Items View when you want to
            quickly find and edit individual guide items.
          </p>
        </div>

        <div className="flex rounded-2xl border border-neutral-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setViewMode('sections')}
            className={
              viewMode === 'sections'
                ? 'h-10 rounded-xl bg-[#11100b] px-4 text-xs font-black text-white'
                : 'h-10 rounded-xl px-4 text-xs font-black text-neutral-500 hover:bg-neutral-100'
            }
          >
            Sections
          </button>

          <button
            type="button"
            onClick={() => setViewMode('items')}
            className={
              viewMode === 'items'
                ? 'h-10 rounded-xl bg-[#11100b] px-4 text-xs font-black text-white'
                : 'h-10 rounded-xl px-4 text-xs font-black text-neutral-500 hover:bg-neutral-100'
            }
          >
            Items
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_210px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />

          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search sections, guide items, content, hours, locations..."
            className="h-12 w-full rounded-2xl border border-neutral-200 bg-white pl-11 pr-4 text-sm font-bold outline-none transition focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as StatusFilter)
          }
          className="h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black outline-none transition focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10"
        >
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active Only</option>
          <option value="HIDDEN">Hidden Only</option>
        </select>

        <select
          value={sortMode}
          onChange={(event) => setSortMode(event.target.value as SortMode)}
          className="h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black outline-none transition focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10"
        >
          <option value="custom">Custom Order</option>
          <option value="title-asc">Title A-Z</option>
          <option value="items-desc">Most Items</option>
        </select>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold text-neutral-500">
          {viewMode === 'sections'
            ? `${visibleSections.length} section${
                visibleSections.length === 1 ? '' : 's'
              } shown`
            : `${flatVisibleItems.length} item${
                flatVisibleItems.length === 1 ? '' : 's'
              } shown`}
        </p>

        {(searchQuery || statusFilter !== 'ALL' || sortMode !== 'custom') ? (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('ALL');
              setSortMode('custom');
            }}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-black text-neutral-600 transition hover:bg-neutral-100"
          >
            Clear Filters
          </button>
        ) : null}
      </div>
    </div>

    <div className="space-y-4 p-5">
      {viewMode === 'sections' ? (
        <>
          {visibleSections.map((section) => {
            const sectionItselfMatches = sectionMatches(
              {
                ...section,
                items: [],
              },
              normalizedQuery
            );

            const visibleItems =
              normalizedQuery && !sectionItselfMatches
                ? section.items.filter((item) =>
                    itemMatches(item, normalizedQuery)
                  )
                : section.items;

            return (
              <SectionAccordionRow
                key={section.id}
                section={section}
                visibleItems={visibleItems}
                expanded={expandedSectionIds.has(section.id)}
                onToggle={() => toggleSection(section.id)}
                onEditSection={setEditingSection}
                onUploadSection={setUploadSection}
                onCreateItem={openCreateItem}
                onEditItem={setEditingItem}
                onUploadItem={setUploadItem}
              />
            );
          })}

          {!visibleSections.length ? (
            <div className="rounded-[2rem] border border-dashed border-neutral-300 bg-white p-10 text-center">
              <p className="font-black">No sections found.</p>
              <p className="mt-1 text-sm text-neutral-500">
                Adjust your search/filter or create a new guide section.
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <div className="space-y-3">
          {flatVisibleItems.map(({ section, item }) => (
            <GuideItemRow
              key={item.id}
              item={item}
              sectionTitle={section.title}
              onEdit={setEditingItem}
              onUpload={setUploadItem}
            />
          ))}

          {!flatVisibleItems.length ? (
            <div className="rounded-[2rem] border border-dashed border-neutral-300 bg-white p-10 text-center">
              <p className="font-black">No guide items found.</p>
              <p className="mt-1 text-sm text-neutral-500">
                Adjust your search/filter or create a new guide item.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  </section>
</div>

      {creatingSection ? (
        <Modal
          title="Create Guide Section"
          description="Add a new main section to the Guest Portal Hotel Guide."
          onClose={() => setCreatingSection(false)}
        >
         <form
              action={createGuideSectionAction}
              
              className="space-y-4"
            >
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
          onClose={closeCreateItem}
        >
          <form
              action={createGuideItemAction}
              className="space-y-4"
            >
            <ItemFormFields
              sections={sections}
              defaultSectionId={defaultItemSectionId}
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeCreateItem}
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
          <form
              action={updateGuideSectionAction}
              className="space-y-4"
            >
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
          <form
                  action={updateGuideItemAction}
                  className="space-y-4">
                    
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