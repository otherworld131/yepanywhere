import { act, renderHook } from "@testing-library/react";
import {
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Message, Session } from "../../types";
import { api } from "../../api/client";
import { useSessionMessages } from "../useSessionMessages";

vi.mock("../../api/client", () => ({
  api: {
    getSession: vi.fn(),
  },
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function createSession(overrides?: Partial<Session>): Session {
  return {
    id: "sess-1",
    projectId: "proj-1",
    title: "Session",
    provider: "claude",
    model: "claude-sonnet",
    cwd: "/tmp/project",
    messageCount: 0,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
    isStarred: false,
    isArchived: false,
    hasUnread: false,
    messages: [],
    ...overrides,
  } as unknown as Session;
}

function createMessage(id: string, content: string): Message {
  return {
    id,
    type: "assistant",
    role: "assistant",
    timestamp: "2026-05-10T00:00:00.000Z",
    message: {
      role: "assistant",
      content,
    },
  };
}

describe("useSessionMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("waits for the initial load before issuing one incremental catch-up request", async () => {
    const initialResponse = createDeferred<Awaited<ReturnType<typeof api.getSession>>>();
    const incrementalResponse =
      createDeferred<Awaited<ReturnType<typeof api.getSession>>>();
    const nextIncrementalResponse =
      createDeferred<Awaited<ReturnType<typeof api.getSession>>>();

    (api.getSession as Mock).mockImplementation(
      (
        projectId: string,
        sessionId: string,
        afterMessageId?: string,
        options?: { tailCompactions?: number; beforeMessageId?: string },
      ) => {
        if (
          projectId === "proj-1" &&
          sessionId === "sess-1" &&
          afterMessageId === undefined &&
          options?.tailCompactions === 2
        ) {
          return initialResponse.promise;
        }

        if (
          projectId === "proj-1" &&
          sessionId === "sess-1" &&
          afterMessageId === "msg-1" &&
          options === undefined
        ) {
          return incrementalResponse.promise;
        }

        if (
          projectId === "proj-1" &&
          sessionId === "sess-1" &&
          afterMessageId === "msg-2" &&
          options === undefined
        ) {
          return nextIncrementalResponse.promise;
        }

        throw new Error(
          `Unexpected getSession call: ${JSON.stringify({
            projectId,
            sessionId,
            afterMessageId,
            options,
          })}`,
        );
      },
    );

    const { result } = renderHook(() =>
      useSessionMessages({
        projectId: "proj-1",
        sessionId: "sess-1",
      }),
    );

    expect(api.getSession).toHaveBeenCalledTimes(1);
    expect(api.getSession).toHaveBeenNthCalledWith(
      1,
      "proj-1",
      "sess-1",
      undefined,
      { tailCompactions: 2 },
    );

    let firstFetch: Promise<void>;
    let secondFetch: Promise<void>;

    await act(async () => {
      firstFetch = result.current.fetchNewMessages();
      secondFetch = result.current.fetchNewMessages();
      await Promise.resolve();
    });

    expect(api.getSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      initialResponse.resolve({
        session: createSession(),
        messages: [createMessage("msg-1", "Initial message")],
        ownership: { owner: "none" },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.getSession).toHaveBeenCalledTimes(2);
    expect(api.getSession).toHaveBeenNthCalledWith(
      2,
      "proj-1",
      "sess-1",
      "msg-1",
      undefined,
    );

    await act(async () => {
      incrementalResponse.resolve({
        session: createSession({ messageCount: 2 }),
        messages: [createMessage("msg-2", "Follow-up message")],
        ownership: { owner: "none" },
      });
      await Promise.all([firstFetch!, secondFetch!]);
    });

    expect(api.getSession).toHaveBeenCalledTimes(2);
    expect(result.current.messages.map((message) => message.id)).toEqual([
      "msg-1",
      "msg-2",
    ]);

    let thirdFetch: Promise<void>;

    await act(async () => {
      thirdFetch = result.current.fetchNewMessages();
      await Promise.resolve();
    });

    expect(api.getSession).toHaveBeenCalledTimes(3);
    expect(api.getSession).toHaveBeenNthCalledWith(
      3,
      "proj-1",
      "sess-1",
      "msg-2",
      undefined,
    );

    await act(async () => {
      nextIncrementalResponse.resolve({
        session: createSession({ messageCount: 3 }),
        messages: [createMessage("msg-3", "Newest message")],
        ownership: { owner: "none" },
      });
      await thirdFetch!;
    });

    expect(result.current.messages.map((message) => message.id)).toEqual([
      "msg-1",
      "msg-2",
      "msg-3",
    ]);
  });

  it("keeps the incremental cursor on the last persisted message when stream-only messages arrive", async () => {
    const initialResponse =
      createDeferred<Awaited<ReturnType<typeof api.getSession>>>();
    const incrementalResponse =
      createDeferred<Awaited<ReturnType<typeof api.getSession>>>();

    (api.getSession as Mock).mockImplementation(
      (
        projectId: string,
        sessionId: string,
        afterMessageId?: string,
        options?: { tailCompactions?: number; beforeMessageId?: string },
      ) => {
        if (
          projectId === "proj-1" &&
          sessionId === "sess-1" &&
          afterMessageId === undefined &&
          options?.tailCompactions === 2
        ) {
          return initialResponse.promise;
        }

        if (
          projectId === "proj-1" &&
          sessionId === "sess-1" &&
          afterMessageId === "msg-1" &&
          options === undefined
        ) {
          return incrementalResponse.promise;
        }

        throw new Error(
          `Unexpected getSession call: ${JSON.stringify({
            projectId,
            sessionId,
            afterMessageId,
            options,
          })}`,
        );
      },
    );

    const { result } = renderHook(() =>
      useSessionMessages({
        projectId: "proj-1",
        sessionId: "sess-1",
      }),
    );

    await act(async () => {
      initialResponse.resolve({
        session: createSession(),
        messages: [createMessage("msg-1", "Initial message")],
        ownership: { owner: "none" },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      result.current.handleStreamMessageEvent(
        createMessage("stream-only-2", "Stream-only tail message"),
      );
      await Promise.resolve();
    });

    let fetchPromise: Promise<void>;

    await act(async () => {
      fetchPromise = result.current.fetchNewMessages();
      await Promise.resolve();
    });

    expect(api.getSession).toHaveBeenNthCalledWith(
      2,
      "proj-1",
      "sess-1",
      "msg-1",
      undefined,
    );

    await act(async () => {
      incrementalResponse.resolve({
        session: createSession({ messageCount: 2 }),
        messages: [createMessage("msg-2", "Persisted follow-up")],
        ownership: { owner: "none" },
      });
      await fetchPromise!;
    });
  });
});
