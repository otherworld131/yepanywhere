import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { SessionSurface } from "../components/SessionSurface";
import {
  WORKSPACE_PANE_IDS,
  type WorkspacePaneId,
  useWorkspaceState,
} from "../hooks/useWorkspaceState";
import { useI18n } from "../i18n";
import { useNavigationLayout } from "../layouts";
import { getSessionDragData, hasSessionDragData } from "../lib/workspaceDrag";

const SidebarIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
);

export function WorkspacePage() {
  const { t } = useI18n();
  const { openSidebar, isWideScreen, toggleSidebar, isSidebarCollapsed } =
    useNavigationLayout();
  const {
    state,
    visiblePaneIds,
    setLayout,
    setActivePane,
    assignPane,
    clearPane,
  } = useWorkspaceState();
  const [dropTargetPaneId, setDropTargetPaneId] =
    useState<WorkspacePaneId | null>(null);

  const visiblePanes = useMemo(
    () =>
      visiblePaneIds.map((paneId) => ({
        paneId,
        assignment: state.panes[WORKSPACE_PANE_IDS.indexOf(paneId)],
      })),
    [state.panes, visiblePaneIds],
  );

  if (!isWideScreen) {
    return <Navigate to="/sessions" replace />;
  }

  const handleDragOver = (
    paneId: WorkspacePaneId,
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    if (!hasSessionDragData(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropTargetPaneId !== paneId) {
      setDropTargetPaneId(paneId);
    }
  };

  const handleDragLeave = (
    paneId: WorkspacePaneId,
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    const nextTarget = event.relatedTarget;
    if (
      nextTarget instanceof Node &&
      event.currentTarget.contains(nextTarget)
    ) {
      return;
    }
    if (dropTargetPaneId === paneId) {
      setDropTargetPaneId(null);
    }
  };

  const handleDrop = (
    paneId: WorkspacePaneId,
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    const payload = getSessionDragData(event);
    if (!payload) return;
    event.preventDefault();
    assignPane(paneId, {
      sessionId: payload.sessionId,
      projectId: payload.projectId,
    });
    setDropTargetPaneId(null);
  };

  return (
    <div className="workspace-page">
      <header className="session-header workspace-shell-header">
        <div className="session-header-inner">
          <div className="session-header-left">
            {!(isWideScreen && isSidebarCollapsed) && (
              <button
                type="button"
                className="sidebar-toggle"
                onClick={isWideScreen ? toggleSidebar : openSidebar}
                title={t("sessionToggleSidebar")}
                aria-label={t("sessionToggleSidebar")}
              >
                <SidebarIcon />
              </button>
            )}
            <div className="workspace-shell-title-group">
              <span className="session-title">{t("workspaceTitle")}</span>
              <span className="workspace-shell-subtitle">
                {t("workspaceSubtitle")}
              </span>
            </div>
          </div>
          <div className="workspace-layout-switcher" role="group">
            <LayoutButton
              label="2"
              title={t("workspaceLayoutTwo")}
              active={state.layout === 2}
              onClick={() => setLayout(2)}
            />
            <LayoutButton
              label="3"
              title={t("workspaceLayoutThree")}
              active={state.layout === 3}
              onClick={() => setLayout(3)}
            />
            <LayoutButton
              label="4"
              title={t("workspaceLayoutFour")}
              active={state.layout === 4}
              onClick={() => setLayout(4)}
            />
          </div>
        </div>
      </header>

      <main className="workspace-body">
        <div className={`workspace-grid layout-${state.layout}`}>
          {visiblePanes.map(({ paneId, assignment }) => (
            <div
              key={paneId}
              className={`workspace-pane ${state.activePaneId === paneId ? "is-active" : ""} ${dropTargetPaneId === paneId ? "is-drop-target" : ""}`}
              onClick={assignment ? undefined : () => setActivePane(paneId)}
              onKeyDown={
                assignment
                  ? undefined
                  : (event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActivePane(paneId);
                      }
                    }
              }
              onDragOver={(event) => handleDragOver(paneId, event)}
              onDragLeave={(event) => handleDragLeave(paneId, event)}
              onDrop={(event) => handleDrop(paneId, event)}
              role={assignment ? undefined : "button"}
              tabIndex={assignment ? undefined : 0}
            >
              {assignment ? (
                <SessionSurface
                  key={`${paneId}-${assignment.sessionId}`}
                  projectId={assignment.projectId}
                  sessionId={assignment.sessionId}
                  variant="workspace"
                  paneId={paneId}
                  isActive={state.activePaneId === paneId}
                  onActivate={() => setActivePane(paneId)}
                  onClearPane={() => clearPane(paneId)}
                  onSessionAssigned={(nextAssignment) =>
                    assignPane(paneId, nextAssignment)
                  }
                />
              ) : (
                <EmptyWorkspacePane paneId={paneId} />
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function LayoutButton({
  label,
  title,
  active,
  onClick,
}: {
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`workspace-layout-button ${active ? "active" : ""}`}
      onClick={onClick}
      title={title}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

function EmptyWorkspacePane({
  paneId,
}: {
  paneId: WorkspacePaneId;
}) {
  const { t } = useI18n();

  return (
    <div className="workspace-empty-pane">
      <span className="workspace-empty-pane-label">
        {t("workspacePaneLabel", {
          number: paneId.replace("pane-", ""),
        })}
      </span>
      <h2>{t("workspaceEmptyTitle")}</h2>
      <p>{t("workspaceEmptyHint")}</p>
    </div>
  );
}
