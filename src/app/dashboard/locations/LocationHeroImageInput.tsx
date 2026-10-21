'use client';

import { useEffect, useRef, useState } from 'react';

export function LocationHeroImageInput({
  currentUrl,
}: {
  currentUrl?: string | null;
}) {
  const [previewUrl, setPreviewUrl] = useState(currentUrl || '');
  const objectUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!objectUrl.current) setPreviewUrl(currentUrl || '');
  }, [currentUrl]);

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  return (
    <div className="grid gap-4 border border-neutral-200 bg-neutral-50 p-4 md:col-span-2 md:grid-cols-[minmax(0,220px)_1fr] dark:border-neutral-800 dark:bg-neutral-900">
      <div className="aspect-[4/3] overflow-hidden bg-[#171713]">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Guest portal image preview"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center p-4 text-center text-sm text-white/70">
            Add a photo of this location
          </div>
        )}
      </div>

      <div className="grid content-start gap-4">
        <div>
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">
            Guest portal image
          </p>
          <p className="mt-1 text-xs leading-5 text-neutral-600 dark:text-neutral-300">
            Shown when guests scan an NFC tag at this location. Choose a photo of the actual area. This overrides the hotel-wide room image.
          </p>
        </div>

        <label className="grid gap-1 text-xs font-semibold text-neutral-700 dark:text-neutral-200">
          Upload image
          <input
            name="heroImage"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
              const file = event.target.files?.[0];
              objectUrl.current = file ? URL.createObjectURL(file) : null;
              setPreviewUrl(objectUrl.current || currentUrl || '');
            }}
            className="w-full border border-neutral-300 bg-white p-2 text-sm font-normal text-neutral-900 file:mr-3 file:border-0 file:bg-[#171713] file:px-3 file:py-2 file:text-white dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
          />
          <span className="font-normal text-neutral-500 dark:text-neutral-400">JPG, PNG, or WEBP, up to 4 MB.</span>
        </label>

        <label className="grid gap-1 text-xs font-semibold text-neutral-700 dark:text-neutral-200">
          Or image URL
          <input
            name="heroImageUrl"
            type="text"
            inputMode="url"
            defaultValue={currentUrl || ''}
            placeholder="https://yourhotel.com/pool.jpg"
            onBlur={(event) => {
              if (!objectUrl.current) setPreviewUrl(event.target.value.trim());
            }}
            className="h-11 w-full border border-neutral-300 bg-white px-3 text-sm font-normal text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
          />
          <span className="font-normal text-neutral-500 dark:text-neutral-400">Leave both empty to use a neutral background.</span>
        </label>
      </div>
    </div>
  );
}
