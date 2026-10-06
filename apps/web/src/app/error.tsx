'use client';

import { Button, Panel } from '@journal/ui';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="standalone-state">
      <Panel>
        <h1>Unable to load this workspace</h1>
        <p>The request could not be completed. Please try again.</p>
        <Button onClick={reset}>Try again</Button>
        <a href="/sign-in">Return to sign in</a>
      </Panel>
    </main>
  );
}
