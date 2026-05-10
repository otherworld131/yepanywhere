import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGlobalSessions } from "../useGlobalSessions";

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
  mockGetGlobalSessionStats,
  mockGetGlobalSessions,
  mockUseFileActivity,
} = vi.hoisted(() => ({
  mockGetGlobalSessionStats: vi.fn(),
  mockGetGlobalSessions: vi.fn(),
  mockUseFileActivity: vi.fn(),
}));

vi.mock("../../api/client", () => ({
  api: {
    getGlobalSessions: mockGetGlobalSessions,
    getGlobalSessionStats: mockGetGlobalSessionStats,
  },
}));

vi.mock("../useFileActivity", () => ({
  useFileActivity: mockUseFileActivity,
}));

const baseResponse = {
  hasMore: false,
  stats: {
    totalCount: 0,
    unreadCount: 0,
    starredCount: 0,
    archivedCount: 0,
    providerCounts: {},
    executorCounts: {},
  },
  projects: [],
};

describe("useGlobalSessions", () => {
  let fileActivityOptions: FileActivityOptions | undefined;

  beforeEach(() => {
    fileActivityOptions = undefined;
    mockGetGlobalSessions.mockReset();
    mockGetGlobalSessionStats.mockReset();
    mockUseFileActivity.mockReset();
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refetches starred queries after a session becomes starred", async () => {
    mockGetGlobalSessions
      .mockResolvedValueOnce({
        ...baseResponse,
        sessions: [],
      })
      .mockResolvedValueOnce({
        ...baseResponse,
        sessions: [
          {
            id: "session-1",
            title: "Session one",
            createdAt: "2026-05-10T08:00:00.000Z",
            updatedAt: "2026-05-10T09:00:00.000Z",
            messageCount: 3,
            provider: "claude",
            projectId: "project-1",
            projectName: "Project 1",
            ownership: { owner: "none" },
            isStarred: true,
          },
        ],
      });

    const { result } = renderHook(() => useGlobalSessions({ starred: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.sessions).toEqual([]);
    expect(mockGetGlobalSessions).toHaveBeenCalledTimes(1);

    act(() => {
      fileActivityOptions?.onSessionMetadataChange?.({
        type: "session-metadata-changed",
        sessionId: "session-1",
        starred: true,
        timestamp: "2026-05-10T09:01:00.000Z",
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(1);
    });

    expect(result.current.sessions[0]?.id).toBe("session-1");
    expect(result.current.sessions[0]?.isStarred).toBe(true);
    expect(mockGetGlobalSessions).toHaveBeenCalledTimes(2);
  });
});
