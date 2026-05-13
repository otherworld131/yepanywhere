import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSession } from "../useSession";

interface FileActivityOptions {
  onFileChange?: (event: {
    type: "file-changed";
    filePath: string;
    fileType: "session" | "agent-session";
    timestamp: string;
  }) => void;
}

const { mockFetchNewMessages, mockUseFileActivity, mockUseSessionMessages } =
  vi.hoisted(() => ({
    mockFetchNewMessages: vi.fn(),
    mockUseFileActivity: vi.fn(),
    mockUseSessionMessages: vi.fn(),
  }));

let sessionStreamOptions:
  | {
      onMessage: (data: { eventType: string; [key: string]: unknown }) => void;
      onError?: (error: Event) => void;
      onOpen?: () => void;
    }
  | undefined;

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
  useSessionStream: (
    _sessionId: string | null,
    options: {
      onMessage: (data: { eventType: string; [key: string]: unknown }) => void;
      onError?: (error: Event) => void;
      onOpen?: () => void;
    },
  ) => {
    sessionStreamOptions = options;
    return {
      connected: false,
      reconnect: vi.fn(),
    };
  },
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

describe("useSession waiting-input catch-up", () => {
  let fileActivityOptions: FileActivityOptions | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    fileActivityOptions = undefined;
    sessionStreamOptions = undefined;
    mockFetchNewMessages.mockReset();
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
      setSession: vi.fn(),
      handleStreamingUpdate: vi.fn(),
      handleStreamMessageEvent: vi.fn(),
      handleStreamSubagentMessage: vi.fn(),
      registerToolUseAgent: vi.fn(),
      setAgentContent: vi.fn(),
      setToolUseToAgent: vi.fn(),
      setMessages: vi.fn(),
      fetchNewMessages: mockFetchNewMessages,
      fetchSessionMetadata: vi.fn(),
      pagination: undefined,
      loadingOlder: false,
      loadOlderMessages: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("fetches persisted messages after entering waiting-input", async () => {
    renderHook(() =>
      useSession("project-1", "session-1", {
        owner: "self",
        processId: "proc-1",
      }),
    );

    expect(fileActivityOptions).toBeDefined();

    await act(async () => {
      sessionStreamOptions?.onMessage({
        eventType: "status",
        state: "waiting-input",
        request: {
          id: "req-1",
          sessionId: "session-1",
          type: "tool_approval",
          prompt: "Approve tool?",
          options: ["yes", "no"],
          timestamp: "2026-05-10T10:00:00.000Z",
        },
      });
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(mockFetchNewMessages).toHaveBeenCalledTimes(1);
  });

  it("fetches persisted messages when the turn completes", async () => {
    renderHook(() =>
      useSession("project-1", "session-1", {
        owner: "self",
        processId: "proc-1",
      }),
    );

    await act(async () => {
      sessionStreamOptions?.onMessage({
        eventType: "complete",
      });
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(mockFetchNewMessages).toHaveBeenCalledTimes(1);
  });
});
