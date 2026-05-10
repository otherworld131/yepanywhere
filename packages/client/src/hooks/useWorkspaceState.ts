import { useCallback, useState } from "react";
import { UI_KEYS } from "../lib/storageKeys";

export const WORKSPACE_PANE_IDS = [
  "pane-1",
  "pane-2",
  "pane-3",
  "pane-4",
] as const;

export type WorkspacePaneId = (typeof WORKSPACE_PANE_IDS)[number];
export type WorkspaceLayout = 2 | 3 | 4;

export interface WorkspacePaneAssignment {
  sessionId: string;
  projectId: string;
}

interface WorkspaceState {
  layout: WorkspaceLayout;
  activePaneId: WorkspacePaneId;
  panes: Array<WorkspacePaneAssignment | null>;
}

const DEFAULT_STATE: WorkspaceState = {
  layout: 2,
  activePaneId: "pane-1",
  panes: [null, null, null, null],
};

function isPaneId(value: unknown): value is WorkspacePaneId {
  return (
    typeof value === "string" &&
    WORKSPACE_PANE_IDS.includes(value as WorkspacePaneId)
  );
}

function isLayout(value: unknown): value is WorkspaceLayout {
  return value === 2 || value === 3 || value === 4;
}

function isAssignment(value: unknown): value is WorkspacePaneAssignment {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WorkspacePaneAssignment>;
  return (
    typeof candidate.sessionId === "string" &&
    typeof candidate.projectId === "string"
  );
}

function loadWorkspaceState(): WorkspaceState {
  if (typeof window === "undefined") return DEFAULT_STATE;

  const raw = localStorage.getItem(UI_KEYS.workspaceState);
  if (!raw) return DEFAULT_STATE;

  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    const panes = Array.isArray(parsed.panes)
      ? WORKSPACE_PANE_IDS.map((_, index) => {
          const value = parsed.panes?.[index];
          return value == null || isAssignment(value) ? (value ?? null) : null;
        })
      : DEFAULT_STATE.panes;

    return {
      layout: isLayout(parsed.layout) ? parsed.layout : DEFAULT_STATE.layout,
      activePaneId: isPaneId(parsed.activePaneId)
        ? parsed.activePaneId
        : DEFAULT_STATE.activePaneId,
      panes,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveWorkspaceState(state: WorkspaceState): void {
  localStorage.setItem(UI_KEYS.workspaceState, JSON.stringify(state));
}

function paneIndex(paneId: WorkspacePaneId): number {
  return WORKSPACE_PANE_IDS.indexOf(paneId);
}

function visiblePaneCount(layout: WorkspaceLayout): number {
  return layout;
}

export function useWorkspaceState() {
  const [state, setState] = useState(loadWorkspaceState);

  const updateState = useCallback(
    (updater: (current: WorkspaceState) => WorkspaceState) => {
      setState((current) => {
        const next = updater(current);
        saveWorkspaceState(next);
        return next;
      });
    },
    [],
  );

  const setLayout = useCallback(
    (layout: WorkspaceLayout) => {
      updateState((current) => {
        const maxVisibleIndex = visiblePaneCount(layout) - 1;
        const activePaneIndex = paneIndex(current.activePaneId);

        return {
          ...current,
          layout,
          activePaneId:
            activePaneIndex > maxVisibleIndex
              ? WORKSPACE_PANE_IDS[0]
              : current.activePaneId,
        };
      });
    },
    [updateState],
  );

  const setActivePane = useCallback(
    (paneId: WorkspacePaneId) => {
      updateState((current) => ({ ...current, activePaneId: paneId }));
    },
    [updateState],
  );

  const assignPane = useCallback(
    (paneId: WorkspacePaneId, assignment: WorkspacePaneAssignment) => {
      updateState((current) => {
        const panes = [...current.panes];
        const targetIndex = paneIndex(paneId);

        const duplicateIndex = panes.findIndex(
          (pane) => pane?.sessionId === assignment.sessionId,
        );

        if (duplicateIndex === targetIndex) {
          return { ...current, activePaneId: paneId };
        }

        if (duplicateIndex >= 0) {
          panes[duplicateIndex] = null;
        }

        panes[targetIndex] = assignment;

        return {
          ...current,
          panes,
          activePaneId: paneId,
        };
      });
    },
    [updateState],
  );

  const clearPane = useCallback(
    (paneId: WorkspacePaneId) => {
      updateState((current) => {
        const panes = [...current.panes];
        panes[paneIndex(paneId)] = null;
        return { ...current, panes };
      });
    },
    [updateState],
  );

  return {
    state,
    visiblePaneIds: WORKSPACE_PANE_IDS.slice(0, visiblePaneCount(state.layout)),
    setLayout,
    setActivePane,
    assignPane,
    clearPane,
  };
}
