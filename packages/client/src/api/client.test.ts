import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";

describe("api.updateServerSettings", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        settings: {
          serviceWorkerEnabled: true,
          persistRemoteSessionsToDisk: false,
        },
      }),
    } as Response);

    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serializes undefined setting values as null so clears reach the server", async () => {
    await api.updateServerSettings({
      globalInstructions: undefined,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls.at(-1) ?? [];
    expect(request?.body).toBe(JSON.stringify({ globalInstructions: null }));
  });
});

describe("api session creation payloads", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionId: "sess-1",
        processId: "proc-1",
        permissionMode: "default",
        modeVersion: 0,
      }),
    } as Response);

    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes optional title in startSession requests", async () => {
    await api.startSession("proj-1", "Ship it", { title: "Release work" });

    const [, request] = fetchMock.mock.calls.at(-1) ?? [];
    expect(request?.body).toBe(
      JSON.stringify({
        message: "Ship it",
        mode: undefined,
        model: undefined,
        thinking: undefined,
        provider: undefined,
        title: "Release work",
        executor: undefined,
        attachments: undefined,
      }),
    );
  });

  it("includes optional title in createSession requests", async () => {
    await api.createSession("proj-1", { title: "Upload flow" });

    const [, request] = fetchMock.mock.calls.at(-1) ?? [];
    expect(request?.body).toBe(
      JSON.stringify({
        mode: undefined,
        model: undefined,
        thinking: undefined,
        provider: undefined,
        title: "Upload flow",
        executor: undefined,
      }),
    );
  });
});
