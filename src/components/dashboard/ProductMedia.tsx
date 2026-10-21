'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function ProductMedia({
  src,
  fallbackSrc,
  name,
  label,
  className,
  children,
}: {
  src?: string | null;
  fallbackSrc?: string | null;
  name: string;
  label?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const imageSrc = [src, fallbackSrc].find(
    (candidate) => candidate && !failedSources.includes(candidate)
  );
  const showImage = Boolean(imageSrc);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0 && imageSrc) {
      setFailedSources((previous) => [...previous, imageSrc]);
    }
  }, [imageSrc]);

  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_30%_20%,rgba(201,156,56,0.22),transparent_45%),linear-gradient(135deg,#292218,#11100b)] px-4 text-center',
        className
      )}
    >
      <span className="font-serif text-base leading-tight tracking-wide text-[#e1c78e]">
        {label || name}
      </span>
      {showImage ? (
        <img
          ref={imageRef}
          src={imageSrc!}
          alt={name}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailedSources((previous) => [...previous, imageSrc!])}
        />
      ) : null}
      {children}
    </div>
  );
}
