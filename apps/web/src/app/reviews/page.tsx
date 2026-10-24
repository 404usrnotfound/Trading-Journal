import { ApplicationShell, WorkspaceAccessNotice } from '@/components/application-shell';
import { ReviewWorkspace } from '@/components/reviews/review-workspace';
import { loadWorkspacePage } from '@/lib/workspace-page';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[]; entry?: string }>;
}) {
  const parameters = await searchParams;
  const { workspace, displayName } = await loadWorkspacePage(parameters.workspace);
  return (
    <ApplicationShell workspace={workspace} displayName={displayName} active="reviews">
      {workspace ? (
        <ReviewWorkspace
          key={workspace.id}
          workspace={workspace}
          initialEntryId={parameters.entry ?? null}
        />
      ) : (
        <WorkspaceAccessNotice title="Journal & period reviews" />
      )}
    </ApplicationShell>
  );
}
