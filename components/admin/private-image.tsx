'use client';
import { useState, type ImgHTMLAttributes } from 'react';
/** Signed/private media and local previews must never enter the shared Next image cache. */
export function PrivateImage({
  src,
  alt,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { src: string; alt: string }) {
  const [failed, set] = useState('');
  if (failed === src) return <span className="ad-image-error">Image unavailable</span>;
  return (
    // biome-ignore lint/performance/noImgElement: Private or blob URL; bypass public image optimisation and omit the referrer.
    <img
      {...props}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => set(src)}
    />
  );
}
