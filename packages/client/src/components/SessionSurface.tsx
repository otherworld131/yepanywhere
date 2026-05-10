import type { ProviderName, UploadedFile } from "@yep-anywhere/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { AgentContentProvider } from "../contexts/AgentContentContext";
import { SessionMetadataProvider } from "../contexts/SessionMetadataContext";
import {
  StreamingMarkdownProvider,
  useStreamingMarkdownContext,
} from "../contexts/StreamingMarkdownContext";
import { useToastContext } from "../contexts/ToastContext";
import { useActivityBusState } from "../hooks/useActivityBusState";
import { useConnection } from "../hooks/useConnection";
import { useDeveloperMode } from "../hooks/useDeveloperMode";
import type { DraftControls } from "../hooks/useDraftPersistence";
import { useEngagementTracking } from "../hooks/useEngagementTracking";
import { getModelSetting, getThinkingSetting } from "../hooks/useModelSettings";
import { useProject } from "../hooks/useProjects";
import { useProviders } from "../hooks/useProviders";
import { recordSessionVisit } from "../hooks/useRecentSessions";
import { useRemoteBasePath } from "../hooks/useRemoteBasePath";
import {
  type StreamingMarkdownCallbacks,
  useSession,
} from "../hooks/useSession";
import type {
  WorkspacePaneAssignment,
  WorkspacePaneId,
} from "../hooks/useWorkspaceState";
import { useI18n } from "../i18n";
import { useNavigationLayout } from "../layouts";
import { preprocessMessages } from "../lib/preprocessMessages";
import { generateUUID } from "../lib/uuid";
import { getSessionDisplayTitle } from "../utils";
import { MessageInput, type UploadProgress } from "./MessageInput";
import { MessageInputToolbar } from "./MessageInputToolbar";
import { MessageList } from "./MessageList";
import { ModelSwitchModal } from "./ModelSwitchModal";
import { ProcessInfoModal } from "./ProcessInfoModal";
import { ProviderBadge } from "./ProviderBadge";
import { QuestionAnswerPanel } from "./QuestionAnswerPanel";
import { RecentSessionsDropdown } from "./RecentSessionsDropdown";
import { SessionMenu } from "./SessionMenu";
import { ToolApprovalPanel } from "./ToolApprovalPanel";

interface InitialSessionState {
  initialStatus?: { owner: "self"; processId: string };
  initialTitle?: string;
  initialModel?: string;
  initialProvider?: ProviderName;
}

export interface SessionSurfaceProps extends InitialSessionState {
  projectId: string;
  sessionId: string;
  variant: "page" | "workspace";
  isActive?: boolean;
  paneId?: WorkspacePaneId;
  onActivate?: () => void;
  onClearPane?: () => void;
  onSessionAssigned?: (assignment: WorkspacePaneAssignment) => void;
}

export function SessionSurface(props: SessionSurfaceProps) {
  return (
    <StreamingMarkdownProvider>
      <SessionSurfaceContent {...props} />
    </StreamingMarkdownProvider>
  );
}

function SessionSurfaceContent({
  projectId,
  sessionId,
  initialStatus,
  initialTitle,
  initialModel,
  initialProvider,
  variant,
  isActive = false,
  paneId,
  onActivate,
  onClearPane,
  onSessionAssigned,
}: SessionSurfaceProps) {
  const { t } = useI18n();
  const { openSidebar, isWideScreen, toggleSidebar, isSidebarCollapsed } =
    useNavigationLayout();
  const basePath = useRemoteBasePath();
  const { project } = useProject(projectId);
  const navigate = useNavigate();

  const streamingMarkdownContext = useStreamingMarkdownContext();
  const streamingMarkdownCallbacks = useMemo<
    StreamingMarkdownCallbacks | undefined
  >(() => {
    if (!streamingMarkdownContext) return undefined;
    return {
      onAugment: streamingMarkdownContext.dispatchAugment,
      onPending: streamingMarkdownContext.dispatchPending,
      onStreamEnd: streamingMarkdownContext.dispatchStreamEnd,
      setCurrentMessageId: streamingMarkdownContext.setCurrentMessageId,
      captureHtml: streamingMarkdownContext.captureStreamingHtml,
    };
  }, [streamingMarkdownContext]);

  const {
    session,
    messages,
    agentContent,
    setAgentContent,
    toolUseToAgent,
    markdownAugments,
    status,
    processState,
    isCompacting,
    pendingInputRequest,
    actualSessionId,
    permissionMode,
    loading,
    error,
    sessionUpdatesConnected,
    lastStreamActivityAt,
    setStatus,
    setProcessState,
    setPermissionMode,
    setHold,
    isHeld,
    pendingMessages,
    addPendingMessage,
    removePendingMessage,
    updatePendingMessage,
    deferredMessages,
    slashCommands,
    setSessionModel,
    pagination,
    loadingOlder,
    loadOlderMessages,
    reconnectStream,
  } = useSession(
    projectId,
    sessionId,
    initialStatus,
    streamingMarkdownCallbacks,
  );

  const { holdModeEnabled, showConnectionBars } = useDeveloperMode();
  const { connectionState } = useActivityBusState();
  const hasSessionUpdateStream =
    status.owner === "self" || status.owner === "external";
  const sessionConnectionStatus =
    !showConnectionBars || !hasSessionUpdateStream
      ? "idle"
      : sessionUpdatesConnected
        ? "connected"
        : connectionState === "reconnecting"
          ? "connecting"
          : "disconnected";

  const effectiveProvider = session?.provider ?? initialProvider;
  const effectiveModel = session?.model ?? initialModel;

  const [scrollTrigger, setScrollTrigger] = useState(0);
  const draftControlsRef = useRef<DraftControls | null>(null);
  const handleDraftControlsReady = useCallback((controls: DraftControls) => {
    draftControlsRef.current = controls;
  }, []);
  const { showToast } = useToastContext();

  const [sharingConfigured, setSharingConfigured] = useState(false);
  useEffect(() => {
    api
      .getSharingStatus()
      .then((res) => setSharingConfigured(res.configured))
      .catch(() => {});
  }, []);

  const connection = useConnection();

  const allSlashCommands = useMemo(() => {
    if (status.owner === "self") {
      return slashCommands.includes("model")
        ? slashCommands
        : ["model", ...slashCommands];
    }
    return slashCommands;
  }, [slashCommands, status.owner]);

  const { providers } = useProviders();
  const currentProviderInfo = useMemo(() => {
    if (!session?.provider) return null;
    return providers.find((p) => p.name === session.provider) ?? null;
  }, [providers, session?.provider]);

  const supportsPermissionMode =
    currentProviderInfo?.supportsPermissionMode ?? true;
  const supportsThinkingToggle =
    currentProviderInfo?.supportsThinkingToggle ?? true;

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const isSavingTitleRef = useRef(false);

  const [showRecentSessions, setShowRecentSessions] = useState(false);
  const titleButtonRef = useRef<HTMLButtonElement>(null);

  const [localCustomTitle, setLocalCustomTitle] = useState<string | undefined>(
    undefined,
  );
  const [localIsArchived, setLocalIsArchived] = useState<boolean | undefined>(
    undefined,
  );
  const [localIsStarred, setLocalIsStarred] = useState<boolean | undefined>(
    undefined,
  );
  const [localHasUnread, setLocalHasUnread] = useState<boolean | undefined>(
    undefined,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset local optimistic state on session switch
  useEffect(() => {
    setLocalCustomTitle(undefined);
    setLocalIsArchived(undefined);
    setLocalIsStarred(undefined);
    setLocalHasUnread(undefined);
  }, [sessionId]);

  useEffect(() => {
    recordSessionVisit(sessionId, projectId);
  }, [sessionId, projectId]);

  useEffect(() => {
    if (!actualSessionId || actualSessionId === sessionId) return;

    if (variant === "page") {
      navigate(
        `${basePath}/projects/${projectId}/sessions/${actualSessionId}`,
        {
          replace: true,
          state: {
            initialStatus,
            initialTitle,
            initialModel,
            initialProvider,
          },
        },
      );
      return;
    }

    onSessionAssigned?.({ sessionId: actualSessionId, projectId });
  }, [
    actualSessionId,
    basePath,
    initialModel,
    initialProvider,
    initialStatus,
    initialTitle,
    navigate,
    onSessionAssigned,
    projectId,
    sessionId,
    variant,
  ]);

  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const pendingUploadsRef = useRef<Map<string, Promise<UploadedFile | null>>>(
    new Map(),
  );
  const [approvalCollapsed, setApprovalCollapsed] = useState(false);
  const [showProcessInfoModal, setShowProcessInfoModal] = useState(false);
  const [showModelSwitchModal, setShowModelSwitchModal] = useState(false);

  const sessionUpdatedAt = session?.updatedAt ?? null;
  const activityAt = useMemo(() => {
    if (!sessionUpdatedAt && !lastStreamActivityAt) return null;
    if (!sessionUpdatedAt) return lastStreamActivityAt;
    if (!lastStreamActivityAt) return sessionUpdatedAt;
    return sessionUpdatedAt > lastStreamActivityAt
      ? sessionUpdatedAt
      : lastStreamActivityAt;
  }, [sessionUpdatedAt, lastStreamActivityAt]);

  useEngagementTracking({
    sessionId,
    activityAt,
    updatedAt: sessionUpdatedAt,
    lastSeenAt: session?.lastSeenAt,
    hasUnread: session?.hasUnread,
    enabled: status.owner !== "external",
  });

  const handleSend = async (text: string) => {
    const tempId = addPendingMessage(text);
    setProcessState("in-turn");
    setScrollTrigger((prev) => prev + 1);

    const currentAttachments = [...attachments];
    const pendingAtSendTime = [...pendingUploadsRef.current.values()];
    if (pendingAtSendTime.length > 0) {
      updatePendingMessage(tempId, { status: t("sessionUploading") });
      setAttachments([]);
      const results = await Promise.all(pendingAtSendTime);
      for (const result of results) {
        if (result) currentAttachments.push(result);
      }
      const sentIds = new Set(currentAttachments.map((a) => a.id));
      setAttachments((prev) => prev.filter((a) => !sentIds.has(a.id)));
      updatePendingMessage(tempId, { status: undefined });
    } else {
      setAttachments([]);
    }

    try {
      if (status.owner === "none") {
        const model = session?.model ?? getModelSetting();
        const thinking = getThinkingSetting();
        const result = await api.resumeSession(
          projectId,
          sessionId,
          text,
          {
            mode: permissionMode,
            model,
            thinking,
            provider: effectiveProvider,
            executor: session?.executor,
          },
          currentAttachments.length > 0 ? currentAttachments : undefined,
          tempId,
        );
        setStatus({ owner: "self", processId: result.processId });
      } else {
        const thinking = getThinkingSetting();
        const result = await api.queueMessage(
          sessionId,
          text,
          permissionMode,
          currentAttachments.length > 0 ? currentAttachments : undefined,
          tempId,
          thinking,
        );
        if (result.restarted && result.processId) {
          setStatus({ owner: "self", processId: result.processId });
          reconnectStream();
        }
      }
      draftControlsRef.current?.clearDraft();
    } catch (err) {
      console.error("Failed to send:", err);

      const is404 =
        err instanceof Error &&
        (err.message.includes("404") ||
          err.message.includes("No active process"));
      if (is404) {
        try {
          const model = session?.model ?? getModelSetting();
          const thinking = getThinkingSetting();
          const result = await api.resumeSession(
            projectId,
            sessionId,
            text,
            {
              mode: permissionMode,
              model,
              thinking,
              provider: effectiveProvider,
              executor: session?.executor,
            },
            currentAttachments.length > 0 ? currentAttachments : undefined,
            tempId,
          );
          setStatus({ owner: "self", processId: result.processId });
          draftControlsRef.current?.clearDraft();
          return;
        } catch (retryErr) {
          console.error("Failed to resume session:", retryErr);
        }
      }

      removePendingMessage(tempId);
      draftControlsRef.current?.restoreFromStorage();
      setAttachments(currentAttachments);
      setProcessState("idle");
      const errorMsg = err instanceof Error ? err.message : String(err);
      showToast(t("sessionSendFailed", { message: errorMsg }), "error");
    }
  };

  const handleQueue = async (text: string) => {
    const tempId = addPendingMessage(text);
    setScrollTrigger((prev) => prev + 1);

    const currentAttachments = [...attachments];
    const pendingAtSendTime = [...pendingUploadsRef.current.values()];
    if (pendingAtSendTime.length > 0) {
      updatePendingMessage(tempId, { status: t("sessionUploading") });
      setAttachments([]);
      const results = await Promise.all(pendingAtSendTime);
      for (const result of results) {
        if (result) currentAttachments.push(result);
      }
      const sentIds = new Set(currentAttachments.map((a) => a.id));
      setAttachments((prev) => prev.filter((a) => !sentIds.has(a.id)));
      updatePendingMessage(tempId, { status: undefined });
    } else {
      setAttachments([]);
    }

    try {
      const thinking = getThinkingSetting();
      await api.queueMessage(
        sessionId,
        text,
        permissionMode,
        currentAttachments.length > 0 ? currentAttachments : undefined,
        tempId,
        thinking,
        true,
      );
      removePendingMessage(tempId);
      draftControlsRef.current?.clearDraft();
    } catch (err) {
      console.error("Failed to queue deferred message:", err);
      removePendingMessage(tempId);
      draftControlsRef.current?.restoreFromStorage();
      setAttachments(currentAttachments);
      const errorMsg = err instanceof Error ? err.message : String(err);
      showToast(t("sessionQueueFailed", { message: errorMsg }), "error");
    }
  };

  const handleModelChanged = useCallback(
    (model: string) => {
      setSessionModel(model);
      showToast(t("sessionSwitchedModel", { model }), "success");
    },
    [setSessionModel, showToast, t],
  );

  const handleCustomCommand = useCallback((command: string) => {
    if (command === "model") {
      setShowModelSwitchModal(true);
      return true;
    }
    return false;
  }, []);

  const handleAbort = async () => {
    if (status.owner === "self" && status.processId) {
      try {
        const result = await api.interruptProcess(status.processId);
        if (result.interrupted) return;
      } catch {
        // Fall through to hard abort.
      }
      await api.abortProcess(status.processId);
    }
  };

  const handleApprove = useCallback(async () => {
    if (!pendingInputRequest) return;
    try {
      await api.respondToInput(sessionId, pendingInputRequest.id, "approve");
    } catch (err) {
      const responseStatus = (err as { status?: number }).status;
      const msg = responseStatus
        ? `Error ${responseStatus}`
        : t("sessionApproveFailed");
      showToast(msg, "error");
    }
  }, [pendingInputRequest, sessionId, showToast, t]);

  const handleApproveAcceptEdits = useCallback(async () => {
    if (!pendingInputRequest) return;
    try {
      await api.respondToInput(
        sessionId,
        pendingInputRequest.id,
        "approve_accept_edits",
      );
      setPermissionMode("acceptEdits");
    } catch (err) {
      const responseStatus = (err as { status?: number }).status;
      const msg = responseStatus
        ? `Error ${responseStatus}`
        : t("sessionApproveFailed");
      showToast(msg, "error");
    }
  }, [pendingInputRequest, sessionId, setPermissionMode, showToast, t]);

  const handleDeny = useCallback(async () => {
    if (!pendingInputRequest) return;
    try {
      await api.respondToInput(sessionId, pendingInputRequest.id, "deny");
    } catch (err) {
      const responseStatus = (err as { status?: number }).status;
      const msg = responseStatus
        ? `Error ${responseStatus}`
        : t("sessionDenyFailed");
      showToast(msg, "error");
    }
  }, [pendingInputRequest, sessionId, showToast, t]);

  const handleDenyWithFeedback = useCallback(
    async (feedback: string) => {
      if (!pendingInputRequest) return;
      try {
        await api.respondToInput(
          sessionId,
          pendingInputRequest.id,
          "deny",
          undefined,
          feedback,
        );
      } catch (err) {
        const responseStatus = (err as { status?: number }).status;
        const msg = responseStatus
          ? `Error ${responseStatus}`
          : t("sessionFeedbackFailed");
        showToast(msg, "error");
      }
    },
    [pendingInputRequest, sessionId, showToast, t],
  );

  const handleQuestionSubmit = useCallback(
    async (answers: Record<string, string>) => {
      if (!pendingInputRequest) return;
      try {
        await api.respondToInput(
          sessionId,
          pendingInputRequest.id,
          "approve",
          answers,
        );
      } catch (err) {
        const responseStatus = (err as { status?: number }).status;
        const msg = responseStatus
          ? `Error ${responseStatus}`
          : t("sessionAnswerFailed");
        showToast(msg, "error");
      }
    },
    [pendingInputRequest, sessionId, showToast, t],
  );

  const handleAttach = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const tempId = generateUUID();

        setUploadProgress((prev) => [
          ...prev,
          {
            fileId: tempId,
            fileName: file.name,
            bytesUploaded: 0,
            totalBytes: file.size,
            percent: 0,
          },
        ]);

        const uploadPromise = connection
          .upload(projectId, sessionId, file, {
            onProgress: (bytesUploaded) => {
              setUploadProgress((prev) =>
                prev.map((progress) =>
                  progress.fileId === tempId
                    ? {
                        ...progress,
                        bytesUploaded,
                        percent: Math.round((bytesUploaded / file.size) * 100),
                      }
                    : progress,
                ),
              );
            },
          })
          .then(
            (uploaded) => {
              setAttachments((prev) => [...prev, uploaded]);
              return uploaded;
            },
            (err) => {
              console.error("Upload failed:", err);
              const errorMsg =
                err instanceof Error ? err.message : t("sessionShareFailed");
              showToast(
                t("sessionUploadFailed", {
                  file: file.name,
                  message: errorMsg,
                }),
                "error",
              );
              return null as UploadedFile | null;
            },
          )
          .finally(() => {
            setUploadProgress((prev) =>
              prev.filter((progress) => progress.fileId !== tempId),
            );
            pendingUploadsRef.current.delete(tempId);
          });

        pendingUploadsRef.current.set(tempId, uploadPromise);
      }
    },
    [connection, projectId, sessionId, showToast, t],
  );

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  }, []);

  const isAskUserQuestion = pendingInputRequest?.toolName === "AskUserQuestion";
  const activeToolApproval =
    processState === "in-turn" ||
    processState === "waiting-input" ||
    (hasSessionUpdateStream && !sessionUpdatesConnected);

  const hasPendingToolCalls = useMemo(() => {
    if (status.owner !== "none") return false;
    const items = preprocessMessages(messages);
    return items.some(
      (item) => item.type === "tool_call" && item.status === "pending",
    );
  }, [messages, status.owner]);

  const sessionTitle = getSessionDisplayTitle(session);
  const displayTitle =
    localCustomTitle ??
    (sessionTitle !== "Untitled" ? sessionTitle : null) ??
    initialTitle ??
    t("sessionUntitled");
  const isArchived = localIsArchived ?? session?.isArchived ?? false;
  const isStarred = localIsStarred ?? session?.isStarred ?? false;
  const hasUnread = localHasUnread ?? session?.hasUnread ?? false;

  useEffect(() => {
    if (variant !== "page") return;

    const baseTitle = "Yep Anywhere";
    if (!project?.name) {
      document.title = baseTitle;
      return () => {
        document.title = baseTitle;
      };
    }

    const truncate = (value: string, maxLength: number) =>
      value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;

    document.title = displayTitle
      ? `${truncate(project.name, 10)} - ${truncate(displayTitle, 20)}`
      : project.name;

    return () => {
      document.title = baseTitle;
    };
  }, [displayTitle, project?.name, variant]);

  const handleStartEditingTitle = () => {
    setRenameValue(displayTitle);
    setIsEditingTitle(true);
    setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
  };

  const handleCancelEditingTitle = () => {
    if (isSavingTitleRef.current) return;
    setIsEditingTitle(false);
    setRenameValue("");
  };

  const handleTitleBlur = () => {
    if (isSavingTitleRef.current) return;
    if (!renameValue.trim() || renameValue.trim() === displayTitle) {
      handleCancelEditingTitle();
      return;
    }
    void handleSaveTitle();
  };

  const handleSaveTitle = async () => {
    if (!renameValue.trim() || isRenaming) return;
    isSavingTitleRef.current = true;
    setIsRenaming(true);
    try {
      await api.updateSessionMetadata(sessionId, { title: renameValue.trim() });
      setLocalCustomTitle(renameValue.trim());
      setIsEditingTitle(false);
      showToast(t("sessionRenamed"), "success");
    } catch (err) {
      console.error("Failed to rename session:", err);
      showToast(t("sessionRenameFailed"), "error");
    } finally {
      setIsRenaming(false);
      isSavingTitleRef.current = false;
    }
  };

  const handleTitleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleSaveTitle();
    } else if (event.key === "Escape") {
      event.preventDefault();
      handleCancelEditingTitle();
    }
  };

  const handleToggleArchive = async () => {
    const newArchived = !isArchived;
    try {
      await api.updateSessionMetadata(sessionId, { archived: newArchived });
      setLocalIsArchived(newArchived);
      showToast(
        newArchived ? t("sessionArchived") : t("sessionUnarchived"),
        "success",
      );
    } catch (err) {
      console.error("Failed to update archive status:", err);
      showToast(t("sessionArchiveFailed"), "error");
    }
  };

  const handleToggleStar = async () => {
    const newStarred = !isStarred;
    try {
      await api.updateSessionMetadata(sessionId, { starred: newStarred });
      setLocalIsStarred(newStarred);
      showToast(
        newStarred ? t("sessionStarred") : t("sessionUnstarred"),
        "success",
      );
    } catch (err) {
      console.error("Failed to update star status:", err);
      showToast(t("sessionStarFailed"), "error");
    }
  };

  const handleToggleRead = async () => {
    const nextHasUnread = !hasUnread;
    setLocalHasUnread(nextHasUnread);
    try {
      if (nextHasUnread) {
        await api.markSessionUnread(sessionId);
      } else {
        await api.markSessionSeen(sessionId);
      }
      showToast(
        nextHasUnread ? t("sessionMarkedUnread") : t("sessionMarkedRead"),
        "success",
      );
    } catch (err) {
      console.error("Failed to update read status:", err);
      setLocalHasUnread(undefined);
      showToast(t("sessionReadFailed"), "error");
    }
  };

  const handleTerminate = async () => {
    if (status.owner !== "self" || !status.processId) return;
    try {
      await api.abortProcess(status.processId);
      showToast(t("sessionTerminated"), "success");
    } catch (err) {
      console.error("Failed to terminate session:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      showToast(t("sessionTerminateFailed", { message: errorMsg }), "error");
    }
  };

  const handleShare = useCallback(async () => {
    try {
      const { snapshotSession } = await import(
        "../lib/sharing/snapshotSession"
      );
      const html = snapshotSession(displayTitle);
      const result = await api.shareSession(html, displayTitle);
      await navigator.clipboard.writeText(result.url);
      showToast(t("sessionLinkCopied"), "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("sessionShareFailed");
      showToast(msg, "error");
    }
  }, [displayTitle, showToast, t]);

  if (error) {
    return (
      <div className="error">
        {t("sessionErrorPrefix")} {error.message}
      </div>
    );
  }

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

  const renderTitle = () => {
    if (loading) return <span className="session-title-skeleton" />;

    if (isEditingTitle) {
      return (
        <input
          ref={renameInputRef}
          type="text"
          className="session-title-input"
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          onKeyDown={handleTitleKeyDown}
          onBlur={handleTitleBlur}
          disabled={isRenaming}
        />
      );
    }

    if (variant === "page") {
      return (
        <>
          <button
            ref={titleButtonRef}
            type="button"
            className="session-title session-title-dropdown-trigger"
            onClick={() => setShowRecentSessions(!showRecentSessions)}
            title={session?.fullTitle ?? displayTitle}
          >
            <span className="session-title-text">{displayTitle}</span>
            <svg
              className="session-title-chevron"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <RecentSessionsDropdown
            currentSessionId={sessionId}
            isOpen={showRecentSessions}
            onClose={() => setShowRecentSessions(false)}
            onNavigate={() => setShowRecentSessions(false)}
            triggerRef={titleButtonRef}
            basePath={basePath}
          />
        </>
      );
    }

    return (
      <div
        className="workspace-session-title-group"
        title={
          project?.name ? `${displayTitle} • ${project.name}` : displayTitle
        }
      >
        <span className="session-title workspace-session-title">
          {displayTitle}
        </span>
        {project?.name && (
          <span className="workspace-session-project">{project.name}</span>
        )}
      </div>
    );
  };

  const renderHeader = () => {
    if (variant === "page") {
      return (
        <header className="session-header">
          <div className="session-header-inner">
            <div className="session-header-left">
              {!(isWideScreen && isSidebarCollapsed) && (
                <button
                  type="button"
                  className="sidebar-toggle"
                  onClick={isWideScreen ? toggleSidebar : openSidebar}
                  title={
                    isWideScreen
                      ? t("sessionToggleSidebar")
                      : t("sessionOpenSidebar")
                  }
                  aria-label={
                    isWideScreen
                      ? t("sessionToggleSidebar")
                      : t("sessionOpenSidebar")
                  }
                >
                  <SidebarIcon />
                </button>
              )}
              {project?.name && (
                <Link
                  to={`${basePath}/sessions?project=${projectId}`}
                  className="project-breadcrumb"
                  title={project.name}
                >
                  {project.name.length > 12
                    ? `${project.name.slice(0, 12)}...`
                    : project.name}
                </Link>
              )}
              <div className="session-title-row">
                {isStarred && (
                  <svg
                    className="star-indicator-inline"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="currentColor"
                    strokeWidth="2"
                    role="img"
                    aria-label={t("sessionStarredLabel")}
                  >
                    <title>{t("sessionStarredLabel")}</title>
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                )}
                {renderTitle()}
                {!loading && isArchived && (
                  <span className="archived-badge">
                    {t("sessionArchivedBadge")}
                  </span>
                )}
                {!loading && (
                  <SessionMenu
                    sessionId={sessionId}
                    projectId={projectId}
                    isStarred={isStarred}
                    isArchived={isArchived}
                    hasUnread={hasUnread}
                    provider={session?.provider}
                    processId={
                      status.owner === "self" ? status.processId : undefined
                    }
                    onToggleStar={handleToggleStar}
                    onToggleArchive={handleToggleArchive}
                    onToggleRead={handleToggleRead}
                    onRename={handleStartEditingTitle}
                    onClone={(newSessionId) => {
                      navigate(
                        `${basePath}/projects/${projectId}/sessions/${newSessionId}`,
                      );
                    }}
                    onTerminate={handleTerminate}
                    sharingConfigured={sharingConfigured}
                    onShare={handleShare}
                    useFixedPositioning
                    useEllipsisIcon
                  />
                )}
              </div>
            </div>
            <div className="session-header-right">
              {!loading && effectiveProvider && (
                <button
                  type="button"
                  className="provider-badge-button"
                  onClick={() => setShowProcessInfoModal(true)}
                  title={t("sessionViewInfo")}
                >
                  <ProviderBadge
                    provider={effectiveProvider}
                    model={effectiveModel}
                    isThinking={processState === "in-turn"}
                  />
                </button>
              )}
            </div>
          </div>
        </header>
      );
    }

    return (
      <header className="session-header workspace-pane-header">
        <div className="session-header-inner">
          <div className="session-header-left">
            <div className="workspace-pane-label">
              {paneId ? paneId.replace("pane-", "") : ""}
            </div>
            <div className="session-title-row workspace-pane-title-row">
              {isStarred && (
                <svg
                  className="star-indicator-inline"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="2"
                  role="img"
                  aria-label={t("sessionStarredLabel")}
                >
                  <title>{t("sessionStarredLabel")}</title>
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              )}
              {renderTitle()}
              {!loading && isArchived && (
                <span className="archived-badge">
                  {t("sessionArchivedBadge")}
                </span>
              )}
            </div>
          </div>
          <div className="session-header-right workspace-pane-actions">
            {!loading && effectiveProvider && (
              <button
                type="button"
                className="provider-badge-button"
                onClick={() => setShowProcessInfoModal(true)}
                title={t("sessionViewInfo")}
              >
                <ProviderBadge
                  provider={effectiveProvider}
                  model={effectiveModel}
                  isThinking={processState === "in-turn"}
                />
              </button>
            )}
            {!loading && session?.provider && (
              <SessionMenu
                sessionId={sessionId}
                projectId={projectId}
                isStarred={isStarred}
                isArchived={isArchived}
                hasUnread={hasUnread}
                provider={session.provider}
                processId={
                  status.owner === "self" ? status.processId : undefined
                }
                onToggleStar={handleToggleStar}
                onToggleArchive={handleToggleArchive}
                onToggleRead={handleToggleRead}
                onRename={handleStartEditingTitle}
                onClone={(newSessionId) => {
                  onSessionAssigned?.({ sessionId: newSessionId, projectId });
                }}
                onTerminate={handleTerminate}
                sharingConfigured={sharingConfigured}
                onShare={handleShare}
                useFixedPositioning
                useEllipsisIcon
              />
            )}
            {onClearPane && (
              <button
                type="button"
                className="workspace-pane-clear"
                onClick={onClearPane}
                title={t("workspaceClearPane")}
                aria-label={t("workspaceClearPane")}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </header>
    );
  };

  const content = (
    <div
      className={
        variant === "page"
          ? isWideScreen
            ? "main-content-wrapper"
            : "main-content-mobile"
          : "session-surface-frame"
      }
    >
      <div
        className={
          variant === "page"
            ? isWideScreen
              ? "main-content-constrained"
              : "main-content-mobile-inner"
            : `session-surface session-surface--workspace ${isActive ? "is-active" : ""}`
        }
        onMouseUp={
          variant === "workspace"
            ? () => {
                const selection = window.getSelection();
                if (selection && !selection.isCollapsed) {
                  return;
                }
                onActivate?.();
              }
            : undefined
        }
        onFocusCapture={variant === "workspace" ? onActivate : undefined}
      >
        {renderHeader()}

        {showProcessInfoModal && session && (
          <ProcessInfoModal
            sessionId={actualSessionId}
            provider={session.provider}
            model={session.model}
            status={status}
            processState={processState}
            contextUsage={session.contextUsage}
            originator={session.originator}
            cliVersion={session.cliVersion}
            sessionSource={session.source}
            approvalPolicy={session.approvalPolicy}
            sandboxPolicy={session.sandboxPolicy}
            createdAt={session.createdAt}
            sessionStreamConnected={sessionUpdatesConnected}
            lastSessionEventAt={lastStreamActivityAt}
            onClose={() => setShowProcessInfoModal(false)}
          />
        )}

        {showModelSwitchModal &&
          status.owner === "self" &&
          status.processId && (
            <ModelSwitchModal
              processId={status.processId}
              currentModel={session?.model}
              onModelChanged={handleModelChanged}
              onClose={() => setShowModelSwitchModal(false)}
            />
          )}

        {status.owner === "external" && (
          <div className="external-session-warning">
            {t("sessionExternalWarning")}
          </div>
        )}

        {hasPendingToolCalls && (
          <div className="external-session-warning pending-tool-warning">
            {t("sessionPendingElsewhereWarning")}
          </div>
        )}

        <main className="session-messages">
          {loading ? (
            <div className="loading">{t("sessionLoading")}</div>
          ) : (
            <SessionMetadataProvider
              projectId={projectId}
              projectPath={project?.path ?? null}
              sessionId={sessionId}
            >
              <AgentContentProvider
                agentContent={agentContent}
                setAgentContent={setAgentContent}
                toolUseToAgent={toolUseToAgent}
                projectId={projectId}
                sessionId={sessionId}
              >
                <MessageList
                  messages={messages}
                  provider={session?.provider}
                  isProcessing={
                    status.owner === "self" && processState === "in-turn"
                  }
                  isCompacting={isCompacting}
                  scrollTrigger={scrollTrigger}
                  pendingMessages={pendingMessages}
                  deferredMessages={deferredMessages}
                  onCancelDeferred={(tempId) =>
                    api.cancelDeferredMessage(sessionId, tempId)
                  }
                  markdownAugments={markdownAugments}
                  activeToolApproval={activeToolApproval}
                  hasOlderMessages={pagination?.hasOlderMessages}
                  loadingOlder={loadingOlder}
                  onLoadOlderMessages={loadOlderMessages}
                />
              </AgentContentProvider>
            </SessionMetadataProvider>
          )}
        </main>

        <footer className="session-input">
          <div
            className={`session-connection-bar session-connection-${sessionConnectionStatus}`}
          />
          <div className="session-input-inner">
            {pendingInputRequest &&
              pendingInputRequest.sessionId === actualSessionId &&
              isAskUserQuestion && (
                <QuestionAnswerPanel
                  request={pendingInputRequest}
                  sessionId={actualSessionId}
                  onSubmit={handleQuestionSubmit}
                  onDeny={handleDeny}
                />
              )}

            {pendingInputRequest &&
              pendingInputRequest.sessionId === actualSessionId &&
              !isAskUserQuestion && (
                <>
                  <ToolApprovalPanel
                    request={pendingInputRequest}
                    sessionId={actualSessionId}
                    onApprove={handleApprove}
                    onDeny={handleDeny}
                    onApproveAcceptEdits={handleApproveAcceptEdits}
                    onDenyWithFeedback={handleDenyWithFeedback}
                    collapsed={approvalCollapsed}
                    onCollapsedChange={setApprovalCollapsed}
                  />
                  <MessageInputToolbar
                    mode={permissionMode}
                    onModeChange={setPermissionMode}
                    isHeld={holdModeEnabled ? isHeld : undefined}
                    onHoldChange={holdModeEnabled ? setHold : undefined}
                    supportsPermissionMode={supportsPermissionMode}
                    supportsThinkingToggle={supportsThinkingToggle}
                    contextUsage={session?.contextUsage}
                    isRunning={status.owner === "self"}
                    isThinking={processState === "in-turn"}
                    onStop={handleAbort}
                    pendingApproval={
                      approvalCollapsed
                        ? {
                            type: "tool-approval",
                            onExpand: () => setApprovalCollapsed(false),
                          }
                        : undefined
                    }
                  />
                </>
              )}

            {!(
              pendingInputRequest &&
              pendingInputRequest.sessionId === actualSessionId &&
              !isAskUserQuestion
            ) && (
              <MessageInput
                onSend={handleSend}
                onQueue={
                  status.owner !== "none" && processState !== "idle"
                    ? handleQueue
                    : undefined
                }
                placeholder={
                  status.owner === "external"
                    ? t("sessionPlaceholderExternal")
                    : processState === "idle"
                      ? t("sessionPlaceholderResume")
                      : t("sessionPlaceholderQueue")
                }
                mode={permissionMode}
                onModeChange={setPermissionMode}
                isHeld={holdModeEnabled ? isHeld : undefined}
                onHoldChange={holdModeEnabled ? setHold : undefined}
                supportsPermissionMode={supportsPermissionMode}
                supportsThinkingToggle={supportsThinkingToggle}
                isRunning={status.owner === "self"}
                isThinking={processState === "in-turn"}
                onStop={handleAbort}
                draftKey={`draft-message-${sessionId}`}
                onDraftControlsReady={handleDraftControlsReady}
                collapsed={
                  !!(
                    pendingInputRequest &&
                    pendingInputRequest.sessionId === actualSessionId
                  )
                }
                contextUsage={session?.contextUsage}
                projectId={projectId}
                sessionId={sessionId}
                attachments={attachments}
                onAttach={handleAttach}
                onRemoveAttachment={handleRemoveAttachment}
                uploadProgress={uploadProgress}
                slashCommands={status.owner === "self" ? allSlashCommands : []}
                onCustomCommand={handleCustomCommand}
              />
            )}
          </div>
        </footer>
      </div>
    </div>
  );

  return content;
}
