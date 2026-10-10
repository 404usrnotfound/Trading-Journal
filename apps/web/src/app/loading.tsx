import { Panel } from '@journal/ui';

export default function LoadingPage() {
  return (
    <main id="main-content" className="standalone-state" tabIndex={-1} aria-busy="true">
      <Panel>
        <h1>Loading your workspace</h1>
        <p role="status">Please wait while your access is checked.</p>
      </Panel>
    </main>
  );
}
