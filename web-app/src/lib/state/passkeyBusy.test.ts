import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PASSKEY_BUSY_LABEL,
  PASSKEY_BUSY_MESSAGE_DELAY_MS,
  schedulePasskeyBusyMessageReveal,
} from "./passkeyBusy";

describe("PASSKEY_BUSY_LABEL", () => {
  it("maps all passkey busy phases", () => {
    expect(PASSKEY_BUSY_LABEL.creating).toBe("Creating Passkey");
    expect(PASSKEY_BUSY_LABEL.authorizing).toBe("Authorizing with Passkey");
    expect(PASSKEY_BUSY_LABEL.signing).toBe("Signing with Passkey");
  });
});

describe("schedulePasskeyBusyMessageReveal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reveals after the default delay", () => {
    const onReveal = vi.fn();
    schedulePasskeyBusyMessageReveal(onReveal);

    expect(onReveal).not.toHaveBeenCalled();

    vi.advanceTimersByTime(PASSKEY_BUSY_MESSAGE_DELAY_MS - 1);
    expect(onReveal).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onReveal).toHaveBeenCalledOnce();
  });

  it("cancel prevents reveal (phase change / unmount)", () => {
    const onReveal = vi.fn();
    const cancel = schedulePasskeyBusyMessageReveal(onReveal);

    cancel();
    vi.advanceTimersByTime(PASSKEY_BUSY_MESSAGE_DELAY_MS);

    expect(onReveal).not.toHaveBeenCalled();
  });

  it("rescheduling requires a fresh delay", () => {
    const first = vi.fn();
    const second = vi.fn();

    const cancelFirst = schedulePasskeyBusyMessageReveal(first);
    vi.advanceTimersByTime(1000);
    cancelFirst();
    schedulePasskeyBusyMessageReveal(second);

    vi.advanceTimersByTime(1000);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
