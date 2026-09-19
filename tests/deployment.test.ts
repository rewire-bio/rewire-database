import { describe, expect, it, vi } from "vitest";
import {
  deployCatalogue,
  fetchWithRetry,
  verifyResolutionPublications,
} from "../scripts/deployment-transaction.mjs";

function operations(failAt?: string) {
  const calls: string[] = [];
  const op = (name: string) =>
    vi.fn(async () => {
      calls.push(name);
      if (name === failAt) throw new Error(name);
    });
  const actions = {
    capture: vi.fn(async () => ({
      release_id: "old-release",
      hosting_version: "old-version",
    })),
    importRelease: op("import"),
    activate: op("activate"),
    verifyApi: op("api"),
    deployHosting: op("hosting"),
    verifyWebsite: op("website"),
    restoreHosting: op("restore-hosting"),
    restoreRelease: op("restore-release"),
  };
  return { actions, calls };
}

describe("correction publication across releases", () => {
  const published = [{ id: "correction-1", published_release_id: "earlier-release" }];
  it("accepts a retained correction from an earlier release", () => {
    expect(() => verifyResolutionPublications(published, published)).not.toThrow();
  });
  it("rejects a correction rebound to the current release", () => {
    expect(() => verifyResolutionPublications([
      { id: "correction-1", published_release_id: "current-release" },
    ], published)).toThrow("differs from the release artifact");
  });
  it("rejects corrections absent from the published artifact", () => {
    expect(() => verifyResolutionPublications([
      { id: "unknown", published_release_id: "earlier-release" },
    ], published)).toThrow("differs from the release artifact");
  });
});

describe("deployment rollback", () => {
  it("verifies both surfaces before declaring success", async () => {
    const { actions, calls } = operations();
    await deployCatalogue(actions);
    expect(calls).toEqual(["import", "activate", "api", "hosting", "website"]);
  });
  it.each(["activate", "api"])(
    "restores the pointer after %s fails",
    async (failure) => {
      const { actions } = operations(failure);
      await expect(deployCatalogue(actions)).rejects.toThrow(
        "retained or restored",
      );
      expect(actions.restoreRelease).toHaveBeenCalledWith("old-release");
      expect(actions.restoreHosting).not.toHaveBeenCalled();
    },
  );
  it.each(["hosting", "website"])(
    "restores Hosting even if %s may have partially succeeded",
    async (failure) => {
      const { actions } = operations(failure);
      await expect(deployCatalogue(actions)).rejects.toThrow(
        "retained or restored",
      );
      expect(actions.restoreHosting).toHaveBeenCalledWith("old-version");
      expect(actions.restoreRelease).toHaveBeenCalledWith("old-release");
    },
  );
  it("still restores the pointer when Hosting rollback fails", async () => {
    const { actions } = operations("website");
    actions.restoreHosting.mockRejectedValue(new Error("rollback unavailable"));
    await expect(deployCatalogue(actions)).rejects.toThrow(
      "operator attention",
    );
    expect(actions.restoreRelease).toHaveBeenCalledWith("old-release");
  });
  it("refuses mutation when rollback targets cannot be captured", async () => {
    const { actions } = operations();
    actions.capture.mockResolvedValue({
      release_id: "",
      hosting_version: "old",
    });
    await expect(deployCatalogue(actions)).rejects.toThrow(
      "required for rollback",
    );
    expect(actions.importRelease).not.toHaveBeenCalled();
  });
  it("does not roll back when import fails before publication", async () => {
    const { actions } = operations("import");
    await expect(deployCatalogue(actions)).rejects.toThrow("import");
    expect(actions.activate).not.toHaveBeenCalled();
    expect(actions.restoreRelease).not.toHaveBeenCalled();
  });
});

describe("bounded live probe retry", () => {
  it("retries a gateway 503 rather than accepting it as disabled submissions", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      );
    const response = await fetchWithRetry("https://example.test", {
      fetchImpl,
      sleep: vi.fn(),
      expectedStatus: 503,
      expectedContentType: "application/json",
    });
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("recovers from a cold-start error and accepts intentional disabled status", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response("{}", { status: 503 }));
    const sleep = vi.fn();
    expect(
      (
        await fetchWithRetry("https://example.test", {
          fetchImpl,
          sleep,
          expectedStatus: 503,
        })
      ).status,
    ).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });
  it("caps transient failures and does not retry client errors", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }));
    await fetchWithRetry("https://example.test", { fetchImpl, sleep: vi.fn() });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    fetchImpl
      .mockClear()
      .mockResolvedValue(new Response(null, { status: 401 }));
    await fetchWithRetry("https://example.test", { fetchImpl, sleep: vi.fn() });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("retries transport failures within the same bound", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("network"));
    await expect(
      fetchWithRetry("https://example.test", { fetchImpl, sleep: vi.fn() }),
    ).rejects.toThrow("network");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
