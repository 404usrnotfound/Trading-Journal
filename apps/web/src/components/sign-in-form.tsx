'use client';

import { signInSchema } from '@journal/contracts';
import { Button } from '@journal/ui';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';

export function SignInForm() {
  const router = useRouter();
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
    const form = new FormData(event.currentTarget);
    const parsed = signInSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!parsed.success) {
      setError('Enter a valid email address and your password.');
      return;
    }
    submitting.current = true;
    setPending(true);
    try {
      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? 'Too many attempts. Please wait before trying again.'
            : 'Unable to sign in. Check your email and password and try again.',
        );
        return;
      }
      router.replace('/');
      router.refresh();
    } catch {
      setError('The connection failed. Please try again.');
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="sign-in-form" aria-busy={pending}>
      <div className="field">
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="you@example.com"
          required
          maxLength={320}
          aria-describedby={error ? 'sign-in-error' : undefined}
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          aria-describedby={error ? 'sign-in-error' : undefined}
        />
      </div>
      {error && (
        <p id="sign-in-error" role="alert" className="form-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="sign-in-submit">
        {pending ? 'Signing in…' : 'Sign in'}
        {pending ? (
          <LoaderCircle size={18} className="spin" aria-hidden="true" />
        ) : (
          <ArrowRight size={18} aria-hidden="true" />
        )}
      </Button>
      <p className="sign-in-note">
        Access is provided by your workspace administrator. Public registration is not available.
      </p>
    </form>
  );
}
