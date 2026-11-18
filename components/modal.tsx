'use client';
import { useEffect, useRef, useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Modal({
  title,
  children,
  close,
  onKeyDown,
  mode = 'drawer',
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLDialogElement>;
  mode?: 'drawer' | 'sheet' | 'search' | 'gallery' | 'menu';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    const previous = document.activeElement;
    const old = document.body.style.overflow;
    d?.showModal();
    document.body.style.overflow = 'hidden';
    d?.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
    return () => {
      d?.close();
      document.body.style.overflow = old;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal modal-${mode}`}
      aria-labelledby={id}
      onKeyDown={onKeyDown}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
        }
      }}
    >
      <div className="modal-head">
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Close ${title.toLowerCase()}`}
          onClick={close}
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
