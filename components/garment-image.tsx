'use client';
import Image, { type ImageProps, type ImageLoaderProps } from 'next/image';
const rendition = ({ src, width }: ImageLoaderProps) =>
  `${src}?w=${width <= 320 ? 320 : width <= 640 ? 640 : width <= 960 ? 960 : 1800}`;
/** Never put a revocable private object through the shared Next optimisation cache. */
export function GarmentImage(props: ImageProps) {
  return (
    <Image
      {...props}
      alt={props.alt}
      loader={typeof props.src === 'string' && props.src.startsWith('/api/media/') ? rendition : undefined}
    />
  );
}
