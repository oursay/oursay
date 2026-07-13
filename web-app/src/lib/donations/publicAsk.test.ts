import { afterEach, describe, expect, it, vi } from "vitest";
import {
  markPublicDonationAskShown,
  PUBLIC_DONATION_COOLDOWN_MS_DEV,
  PUBLIC_DONATION_COOLDOWN_MS_PROD,
  PUBLIC_DONATION_STORAGE_KEY,
  publicDonationCooldownMs,
  shouldOfferPublicDonationAsk,
} from "./publicAsk";

describe("public donation ask timing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    try {
      window.localStorage?.removeItem(PUBLIC_DONATION_STORAGE_KEY);
    } catch {
      // ignore
    }
  });

  it("uses 5 minutes in development and 24h otherwise", () => {
    expect(publicDonationCooldownMs("development")).toBe(PUBLIC_DONATION_COOLDOWN_MS_DEV);
    expect(publicDonationCooldownMs("production")).toBe(PUBLIC_DONATION_COOLDOWN_MS_PROD);
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
    expect(shouldOfferPublicDonationAsk(1_000)).toBe(true);
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
    const cooldown = publicDonationCooldownMs();
    const t0 = 1_000_000;
    markPublicDonationAskShown(t0);
    expect(shouldOfferPublicDonationAsk(t0 + cooldown - 1)).toBe(false);
    expect(shouldOfferPublicDonationAsk(t0 + cooldown)).toBe(true);
  });
});
