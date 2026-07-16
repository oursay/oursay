import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client";
import {
  isPasskeyDiscoveryFailure,
  withPostEnrollLoginSettle,
} from "./passkey-enroll-login";

describe("isPasskeyDiscoveryFailure", () => {
  it("treats unknown-credential API errors as discovery lag", () => {
    expect(
      isPasskeyDiscoveryFailure(
        new ApiError(400, "Unknown credential", "passkey_verification_failed"),
      ),
    ).toBe(true);
  });

  it("does not retry explicit authentication cancel", () => {
    expect(isPasskeyDiscoveryFailure(new Error("Passkey authentication cancelled"))).toBe(
      false,
    );
  });

  it("treats NotAllowedError as discovery lag (Android missing-cred surface)", () => {
    expect(isPasskeyDiscoveryFailure(new DOMException("Not allowed", "NotAllowedError"))).toBe(
      true,
    );
  });

  it("does not retry AbortError", () => {
    expect(isPasskeyDiscoveryFailure(new DOMException("aborted", "AbortError"))).toBe(false);
  });
});

describe("withPostEnrollLoginSettle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("settles then succeeds on first login", async () => {
    const login = vi.fn().mockResolvedValue("ok");
    const sleep = vi.fn((ms: number) => Promise.resolve(void ms));

    const pending = withPostEnrollLoginSettle(login, {
      settleMs: 400,
      retryDelayMs: 900,
      sleep,
    });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe("ok");
    expect(sleep).toHaveBeenCalledWith(400);
    expect(login).toHaveBeenCalledOnce();
  });

  it("retries login once after a discovery failure (never re-enrolls)", async () => {
    const login = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("Not allowed", "NotAllowedError"))
      .mockResolvedValueOnce("ok");
    const sleep = vi.fn((ms: number) => Promise.resolve(void ms));

    const pending = withPostEnrollLoginSettle(login, {
      settleMs: 10,
      retryDelayMs: 20,
      sleep,
    });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe("ok");
    expect(login).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([10, 20]);
  });

  it("does not retry non-discovery failures", async () => {
    const err = new Error("Passkey authentication cancelled");
    const login = vi.fn().mockRejectedValue(err);
    const sleep = vi.fn((ms: number) => Promise.resolve(void ms));

    const pending = withPostEnrollLoginSettle(login, {
      settleMs: 0,
      retryDelayMs: 20,
      sleep,
    });
    await expect(pending).rejects.toThrow("Passkey authentication cancelled");
    expect(login).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });
});
