import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../../apps/web/src/components/ux/confirm-dialog.js';

function Example({
  busy = false,
  onConfirm = () => undefined,
}: {
  busy?: boolean;
  onConfirm?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Review change</button>
      <ConfirmDialog
        open={open}
        title="Post reviewed records?"
        description="Posting changes financial records. Cancel preserves this preview."
        confirmLabel="Post records"
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={onConfirm}
      />
    </>
  );
}

describe('confirmation dialog keyboard and cancellation boundary', () => {
  it('focuses Cancel, contains Tab navigation, and returns focus after Escape without posting', () => {
    const post = vi.fn();
    render(<Example onConfirm={post} />);
    const trigger = screen.getByRole('button', { name: 'Review change' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Post reviewed records?' });
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    const confirm = within(dialog).getByRole('button', { name: 'Post records' });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(post).not.toHaveBeenCalled();
  });
  it('makes posting an explicit action rather than an effect of opening the dialog', () => {
    const post = vi.fn();
    render(<Example onConfirm={post} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Post records' }));
    expect(post).toHaveBeenCalledOnce();
  });
  it('keeps a pending operation modal and disables cancellation and duplicate submission', () => {
    const post = vi.fn();
    render(<Example busy onConfirm={post} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
