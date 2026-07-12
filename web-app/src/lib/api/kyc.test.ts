import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ApiError } from "./client";

vi.mock("./client", async () => {
  const actual = await vi.importActual<typeof import("./client")>("./client");
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPost: vi.fn(),
  };
});

import { apiGet, apiPost } from "./client";
import {
  fetchKycProvider,
  pollDiditSession,
  startDiditSession,
  startRecoveryKycSession,
} from "./kyc";

describe("kyc api client", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPost).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchKycProvider returns stub on failure", async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(new ApiError(500, "boom"));
    expect(await fetchKycProvider()).toBe("stub");
  });

  it("fetchKycProvider returns provider from public endpoint", async () => {
    vi.mocked(apiGet).mockResolvedValueOnce({ provider: "didit" });
    expect(await fetchKycProvider()).toBe("didit");
    expect(apiGet).toHaveBeenCalledWith("/v1/public/kyc");
  });

  it("startDiditSession posts workflowKind", async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({
      sessionId: "s1",
      url: "https://verify.example/s1",
    });
    const started = await startDiditSession("poa");
    expect(started.sessionId).toBe("s1");
    expect(apiPost).toHaveBeenCalledWith("/v1/kyc/didit/session", { workflowKind: "poa" });
  });

  it("pollDiditSession gets status", async () => {
    vi.mocked(apiGet).mockResolvedValueOnce({ status: "approved", tier: "identity_verified" });
    const polled = await pollDiditSession("abc");
    expect(polled.status).toBe("approved");
    expect(apiGet).toHaveBeenCalledWith("/v1/kyc/didit/session/abc");
  });

  it("startRecoveryKycSession posts to recovery route", async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({
      sessionId: "r1",
      url: "https://verify.example/r1",
    });
    const started = await startRecoveryKycSession();
    expect(started.url).toContain("verify.example");
    expect(apiPost).toHaveBeenCalledWith("/v1/auth/recovery/kyc/session", {});
  });
});
