'use client';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import type { Product } from '@/lib/contracts';
import { Modal } from './modal';
export function Gallery({ images }: { images: Product['images'] }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const photo = images[index];
  const move = (dir: number) => setIndex((v) => (v + dir + images.length) % images.length);
  const touchEvents = {
    onTouchStart: (e: React.TouchEvent) => {
      touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (touch.current) {
        const dx = e.changedTouches[0].clientX - touch.current.x;
        const dy = e.changedTouches[0].clientY - touch.current.y;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
      }
      touch.current = null;
    },
  };
  return (
    <div className="gallery">
      <fieldset className="thumbs" aria-label="Image thumbnails">
        {images.map((p, i) => (
          <button
            type="button"
            key={p.src}
            aria-pressed={i === index}
            aria-label={`View image ${i + 1}: ${p.alt}`}
            className={i === index ? 'active' : ''}
            onClick={() => setIndex(i)}
          >
            <Image src={p.src} alt="" fill sizes="70px" />
          </button>
        ))}
      </fieldset>
      <div className="gallery-main" {...touchEvents}>
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          sizes="(max-width:767px) 77vw, 46vw"
          loading="eager"
          fetchPriority="high"
        />
        <button
          type="button"
          className="zoom-btn icon-btn"
          aria-label="View full-screen image"
          onClick={() => setZoom(true)}
        >
          <Maximize2 size={18} />
        </button>
      </div>
      {zoom && (
        <Modal
          title="Image gallery"
          mode="gallery"
          close={() => setZoom(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') move(-1);
            if (e.key === 'ArrowRight') move(1);
          }}
        >
          <div className="full-image" {...touchEvents}>
            <Image alt={photo.alt} src={photo.src} fill sizes="100vw" />
          </div>
          <div className="zoom-controls">
            <button
              type="button"
              className="icon-btn"
              disabled={images.length < 2}
              onClick={() => move(-1)}
              aria-label="Previous image"
            >
              <ChevronLeft />
            </button>
            <span aria-live="polite">
              {index + 1} / {images.length}
            </span>
            <button
              type="button"
              className="icon-btn"
              disabled={images.length < 2}
              onClick={() => move(1)}
              aria-label="Next image"
            >
              <ChevronRight />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
