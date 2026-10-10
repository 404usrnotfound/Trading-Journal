'use client';

import { Button } from '@journal/ui';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authActionResponseSchema, sessionResponseSchema } from '@journal/contracts';
import { apiClient } from '@/lib/api-client';

export function SignOutButton() {
  const router = useRouter();
  const query = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  function finishSignOut() {
    query.clear();
    router.replace('/sign-in');
    router.refresh();
  }

  async function signOut() {
    setPending(true);
    setError(false);
    try {
      const session = await apiClient.GET('/api/auth/session');
      if (!session.response.ok) throw new Error('Session check failed');
      if (sessionResponseSchema.parse(session.data) === null) {
        finishSignOut();
        return;
      }
      const csrfToken = session.response.headers.get('x-csrf-token');
      if (!csrfToken) throw new Error('Session proof unavailable');
      const { response, data } = await apiClient.POST('/api/auth/sign-out', {
        params: { header: { 'X-CSRF-Token': csrfToken } },
        body: {},
      });
      if (response.status === 401) {
        finishSignOut();
        return;
      }
      if (!response.ok) throw new Error('Sign out failed');
      authActionResponseSchema.parse(data);
      finishSignOut();
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
