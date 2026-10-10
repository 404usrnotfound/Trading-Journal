import { Panel } from '@journal/ui';

export default function NotFoundPage() {
  return (
    <main id="main-content" className="standalone-state" tabIndex={-1}>
      <Panel>
        <h1>Workspace not found</h1>
        <p>This workspace is unavailable or you do not have access to it.</p>
        <a href="/">Return to your overview</a>
      </Panel>
    </main>
  );
}
