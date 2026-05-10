import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSession } from "../useSession";

interface FileActivityOptions {
  onSessionMetadataChange?: (event: {
    type: "session-metadata-changed";
    sessionId: string;
    title?: string;
    archived?: boolean;
    starred?: boolean;
    timestamp: string;
  }) => void;
}

const {
  mockFetchSessionMetadata,
  mockSetSession,
  mockUseFileActivity,
  mockUseSessionMessages,
} = vi.hoisted(() => ({
  mockFetchSessionMetadata: vi.fn(),
  mockSetSession: vi.fn(),
  mockUseFileActivity: vi.fn(),
  mockUseSessionMessages: vi.fn(),
}));

vi.mock("../../api/client", () => ({
  api: {
    getSessionMetadata: vi.fn(),
    setPermissionMode: vi.fn(),
  },
}));

vi.mock("../useFileActivity", () => ({
  useFileActivity: mockUseFileActivity,
}));

vi.mock("../useSessionMessages", () => ({
  useSessionMessages: mockUseSessionMessages,
}));

vi.mock("../useSessionStream", () => ({
  useSessionStream: () => ({
    connected: false,
    reconnect: vi.fn(),
  }),
}));

vi.mock("../useSessionWatchStream", () => ({
  useSessionWatchStream: () => ({
    connected: false,
  }),
}));

vi.mock("../useStreamingContent", () => ({
  useStreamingContent: () => ({
    handleStreamEvent: vi.fn(),
    clearStreaming: vi.fn(),
    cleanup: vi.fn(),
  }),
}));

describe("useSession metadata sync", () => {
  let fileActivityOptions: FileActivityOptions | undefined;

  beforeEach(() => {
    fileActivityOptions = undefined;
    mockFetchSessionMetadata.mockReset();
    mockSetSession.mockReset();
    mockUseFileActivity.mockReset();
    mockUseSessionMessages.mockReset();

    mockUseFileActivity.mockImplementation((options?: FileActivityOptions) => {
      fileActivityOptions = options;
      return {
        events: [],
        connected: true,
        paused: false,
        connect: vi.fn(),
        disconnect: vi.fn(),
        clearEvents: vi.fn(),
        togglePause: vi.fn(),
        filterByPath: vi.fn(),
        filterByType: vi.fn(),
      };
    });

    mockUseSessionMessages.mockReturnValue({
      messages: [],
      agentContent: {},
      toolUseToAgent: new Map(),
      loading: false,
      session: {
        id: "session-1",
        provider: "claude",
        model: "sonnet",
      },
      setSession: mockSetSession,
      handleStreamingUpdate: vi.fn(),
      handleStreamMessageEvent: vi.fn(),
      handleStreamSubagentMessage: vi.fn(),
      registerToolUseAgent: vi.fn(),
      setAgentContent: vi.fn(),
      setToolUseToAgent: vi.fn(),
      setMessages: vi.fn(),
      fetchNewMessages: vi.fn(),
      fetchSessionMetadata: mockFetchSessionMetadata,
      pagination: undefined,
      loadingOlder: false,
      loadOlderMessages: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refetches metadata when the current session receives a metadata event", () => {
    renderHook(() => useSession("project-1", "session-1"));

    act(() => {
      fileActivityOptions?.onSessionMetadataChange?.({
        type: "session-metadata-changed",
        sessionId: "session-1",
        starred: true,
        timestamp: "2026-05-10T10:00:00.000Z",
      });
    });

    expect(mockFetchSessionMetadata).toHaveBeenCalledTimes(1);
    expect(mockSetSession).toHaveBeenCalledTimes(1);
  });

  it("ignores metadata events for other sessions", () => {
    renderHook(() => useSession("project-1", "session-1"));

    act(() => {
      fileActivityOptions?.onSessionMetadataChange?.({
        type: "session-metadata-changed",
        sessionId: "session-2",
        starred: true,
        timestamp: "2026-05-10T10:00:00.000Z",
      });
    });

    expect(mockFetchSessionMetadata).not.toHaveBeenCalled();
  });
});
