import { afterEach, describe, expect, it, vi } from "vitest";
import {
  markVerifyAskShown,
  shouldOfferVerifyAsk,
  VERIFY_ASK_COOLDOWN_MS_DEV,
  VERIFY_ASK_COOLDOWN_MS_PROD,
  VERIFY_ASK_STORAGE_KEY,
  verifyAskCooldownMs,
} from "./verifyAsk";

describe("verify soft-ask timing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    try {
      window.localStorage?.removeItem(VERIFY_ASK_STORAGE_KEY);
    } catch {
      // ignore
    }
  });

  it("uses 5 minutes in development and 24h otherwise", () => {
    expect(verifyAskCooldownMs("development")).toBe(VERIFY_ASK_COOLDOWN_MS_DEV);
    expect(verifyAskCooldownMs("production")).toBe(VERIFY_ASK_COOLDOWN_MS_PROD);
  });

  it("offers when never shown", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
    expect(shouldOfferVerifyAsk(1_000)).toBe(true);
  });

  it("suppresses within cooldown and allows after", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
    const cooldown = verifyAskCooldownMs();
    const t0 = 1_000_000;
    markVerifyAskShown(t0);
    expect(shouldOfferVerifyAsk(t0 + cooldown - 1)).toBe(false);
    expect(shouldOfferVerifyAsk(t0 + cooldown)).toBe(true);
  });
});
