'use client';

import { Button } from '@journal/ui';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SignOutButton() {
  const router = useRouter();
  const query = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function signOut() {
    setPending(true);
    setError(false);
    try {
      const response = await fetch('/api/auth/sign-out', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('Sign out failed');
      query.clear();
      router.replace('/sign-in');
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="sign-out-control">
      <Button variant="quiet" onClick={signOut} disabled={pending}>
        <LogOut size={16} aria-hidden="true" />
        {pending ? 'Signing out…' : 'Sign out'}
      </Button>
      {error && <p role="alert">Unable to sign out. Please try again.</p>}
    </div>
  );
}
