'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { authActionResponseSchema, signInSchema, type SignInInput } from '@journal/contracts';
import { Button } from '@journal/ui';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { apiClient } from '@/lib/api-client';

export function SignInForm() {
  const router = useRouter();
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  async function submit(input: SignInInput) {
    if (submitting.current) return;
    setError(null);
    submitting.current = true;
    setPending(true);
    try {
      const { response, data } = await apiClient.POST('/api/auth/sign-in/email', {
        body: input,
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? 'Too many attempts. Please wait before trying again.'
            : 'Unable to sign in. Check your email and password and try again.',
        );
        return;
      }
      authActionResponseSchema.parse(data);
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
    <form
      onSubmit={(event) => {
        void handleSubmit(submit)(event);
      }}
      className="sign-in-form"
      aria-busy={pending}
      noValidate
    >
      <div className="field">
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          {...register('email')}
          type="email"
          autoComplete="username"
          placeholder="you@example.com"
          required
          maxLength={320}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'email-error' : error ? 'sign-in-error' : undefined}
        />
        {errors.email && (
          <p id="email-error" role="alert" className="form-error">
            Enter a valid email address.
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          {...register('password')}
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={
            errors.password ? 'password-error' : error ? 'sign-in-error' : undefined
          }
        />
        {errors.password && (
          <p id="password-error" role="alert" className="form-error">
            Enter your password, up to 128 characters.
          </p>
        )}
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
