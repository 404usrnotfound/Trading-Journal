'use client';

import type { WorkspaceResponse } from '@journal/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

export function WorkspaceSwitcher({
  workspaces,
  selected,
}: {
  workspaces: WorkspaceResponse[];
  selected: string;
}) {
  const router = useRouter();
  const query = useQueryClient();
  return (
    <div className="workspace-switcher field">
      <label htmlFor="workspace">Workspace</label>
      <select
        id="workspace"
        value={selected}
        onChange={(event) => {
          query.clear();
          router.replace(`/?workspace=${encodeURIComponent(event.target.value)}`);
          router.refresh();
        }}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
            {workspace.isDemo ? ' (demo)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
