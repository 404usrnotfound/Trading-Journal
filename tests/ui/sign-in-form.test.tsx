import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignInForm } from '../../apps/web/src/components/sign-in-form.js';

const { post, replace, refresh } = vi.hoisted(() => ({
  post: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('../../apps/web/src/lib/api-client.js', () => ({ apiClient: { POST: post } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
}));

beforeEach(() => vi.clearAllMocks());

function submitCredentials(email = 'owner@example.test', password = 'test-only-password') {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);
}

describe('sign-in trust boundary', () => {
  it('keeps invalid fields local, associates the error, and focuses the first invalid field', async () => {
    render(<SignInForm />);
    submitCredentials('not-an-email');
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');
    await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveFocus());
    expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true');
    expect(post).not.toHaveBeenCalled();
  });

  it('shows a safe retryable authentication error and releases the submit button', async () => {
    post.mockResolvedValue({ response: new Response(null, { status: 401 }), data: undefined });
    render(<SignInForm />);
    submitCredentials();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to sign in. Check your email and password and try again.',
    );
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('validates the safe response before refreshing authenticated server content', async () => {
    post.mockResolvedValue({ response: new Response(null, { status: 200 }), data: { ok: true } });
    render(<SignInForm />);
    submitCredentials();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(post).toHaveBeenCalledWith('/api/auth/sign-in/email', {
      body: { email: 'owner@example.test', password: 'test-only-password' },
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('rejects an unexpected successful payload without exposing its contents', async () => {
    post.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      data: { ok: true, token: 'fixture-for-unexpected-private-field' },
    });
    render(<SignInForm />);
    submitCredentials();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The connection failed. Please try again.',
    );
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText('fixture-for-unexpected-private-field')).not.toBeInTheDocument();
  });
});
