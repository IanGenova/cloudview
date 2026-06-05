'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';

type MenuImageUploadPreviewProps = {
  name?: string;
  currentImageUrl?: string | null;
  currentImageAlt?: string;
};

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function MenuImageUploadPreview({
  name = 'imageFile',
  currentImageUrl,
  currentImageAlt = 'Product image',
}: MenuImageUploadPreviewProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  const displayImageUrl = previewUrl || currentImageUrl || null;
  const hasSelectedFile = Boolean(selectedFile);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
  }

  function clearSelectedFile(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    setSelectedFile(null);

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        name={name}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={handleFileChange}
        className="block w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 outline-none file:mr-4 file:rounded-xl file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:text-sm file:font-black file:text-white hover:file:bg-neutral-700"
      />

      <div className="overflow-hidden rounded-[1.5rem] border border-dashed border-neutral-200 bg-neutral-50">
        {displayImageUrl ? (
          <div className="relative">
            <img
              src={displayImageUrl}
              alt={
                hasSelectedFile
                  ? selectedFile?.name || 'Selected product image'
                  : currentImageAlt
              }
              className="h-56 w-full object-cover"
            />

            <div className="absolute left-3 top-3 rounded-full bg-black/75 px-3 py-1 text-xs font-black text-white">
              {hasSelectedFile ? 'New image preview' : 'Current image'}
            </div>

            {hasSelectedFile ? (
              <button
                type="button"
                onClick={clearSelectedFile}
                className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-white text-black shadow-lg hover:bg-neutral-100"
                aria-label="Remove selected image"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid min-h-56 place-items-center p-6 text-center">
            <div>
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-white text-neutral-400 shadow-sm">
                <ImagePlus className="size-7" />
              </div>
              <p className="mt-3 text-sm font-black text-neutral-700">
                No image selected yet
              </p>
              <p className="mt-1 text-xs font-semibold text-neutral-500">
                Choose a JPG, PNG, WEBP, or GIF file to preview it before upload.
              </p>
            </div>
          </div>
        )}
      </div>

      {selectedFile ? (
        <div className="rounded-2xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
          Selected: {selectedFile.name} · {formatFileSize(selectedFile.size)}
        </div>
      ) : currentImageUrl ? (
        <div className="rounded-2xl bg-neutral-50 p-3 text-xs font-bold text-neutral-500">
          The current image will remain unless you choose a new file or enter an Image URL.
        </div>
      ) : null}
    </div>
  );
}