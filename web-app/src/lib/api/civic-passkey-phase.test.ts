import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasLocalThreadCredential,
  notifyCivicPasskeyPhase,
  setCivicPasskeyPhaseListener,
} from "./civic-passkey-phase";

describe("civic-passkey-phase bridge", () => {
  afterEach(() => {
    setCivicPasskeyPhaseListener(null);
    vi.unstubAllGlobals();
  });

  it("notifies the registered listener", () => {
    const listener = vi.fn();
    setCivicPasskeyPhaseListener(listener);
    notifyCivicPasskeyPhase("creating");
    notifyCivicPasskeyPhase("signing");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, "creating");
    expect(listener).toHaveBeenNthCalledWith(2, "signing");
  });

  it("clearing the listener is a no-op for notify", () => {
    const listener = vi.fn();
    setCivicPasskeyPhaseListener(listener);
    setCivicPasskeyPhaseListener(null);
    notifyCivicPasskeyPhase("signing");
    expect(listener).not.toHaveBeenCalled();
  });

  it("hasLocalThreadCredential reads ThreadPasskeyStore", () => {
    const backing = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => {
        backing.set(k, v);
      },
    });

    expect(hasLocalThreadCredential("u1", "thread-a")).toBe(false);

    backing.set(
      "oursay/thread-passkey/u1/thread-a",
      JSON.stringify({
        credentialIdHex: "ab",
        signingPubkey: "02".padEnd(66, "b"),
        personaPubkey: "",
      }),
    );

    expect(hasLocalThreadCredential("u1", "thread-a")).toBe(true);
    expect(hasLocalThreadCredential("u1", "thread-b")).toBe(false);
  });
});
