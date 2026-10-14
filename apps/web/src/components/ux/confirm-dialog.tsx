'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from '@journal/ui';

/** Browser modal focus/inertness, with a small fallback for non-browser component tests. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open || !dialog.current) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    if (typeof element.showModal === 'function') element.showModal();
    else element.setAttribute('open', '');
    cancel.current?.focus();
    return () => {
      if (element.open && typeof element.close === 'function') element.close();
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={dialog}
      className="ux-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      aria-modal="true"
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (!busy) onCancel();
        }
        if (event.key !== 'Tab') return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ),
        );
        const first = controls[0],
          last = controls.at(-1);
        if (!first || !last) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      <div id={`${id}-description`} className="ux-dialog-description">
        {description}
      </div>
      <div className="workflow-actions">
        <button
          ref={cancel}
          type="button"
          className="button button-secondary"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <Button disabled={busy} onClick={onConfirm}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
