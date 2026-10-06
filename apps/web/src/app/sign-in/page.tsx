import { getSafeSession } from '@journal/server';
import { Brand, Panel } from '@journal/ui';
import { ArrowUpRight, LockKeyhole } from 'lucide-react';
import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/sign-in-form';
import { ThemeToggle } from '@/components/theme-toggle';
import { serverRequest } from '@/lib/server-request';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function SignInPage() {
  if (await getSafeSession(await serverRequest())) redirect('/');
  return (
    <div className="auth-layout">
      <header className="auth-header">
        <Brand />
        <ThemeToggle />
      </header>
      <main id="main-content" className="auth-main">
        <div className="auth-introduction">
          <div className="eyebrow">
            <span className="eyebrow-line" /> YOUR PRIVATE WORKSPACE
          </div>
          <h1>
            A clearer view of
            <br />
            every decision.
          </h1>
          <p>
            One place to build a thoughtful trading practice. Start with a private workspace that
            belongs to you.
          </p>
          <div className="auth-intro-footnote">
            <LockKeyhole size={18} aria-hidden="true" />
            <span>Private access. No live trading connection.</span>
          </div>
        </div>
        <Panel className="auth-card">
          <div className="auth-card-marker" aria-hidden="true">
            <ArrowUpRight size={23} />
          </div>
          <h2>Welcome back</h2>
          <p className="muted">Sign in to your Trading Journal workspace.</p>
          <SignInForm />
        </Panel>
      </main>
      <footer className="auth-footer">
        Trading Journal <span>Platform foundation</span>
      </footer>
    </div>
  );
}
