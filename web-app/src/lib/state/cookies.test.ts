import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION,
  DEFAULT_SUBSCRIPTIONS,
  readSession,
  readSubscriptions,
  writeSession,
  writeSubscriptions,
} from "./cookies";
import { ALBERTA_ID, GLOBAL_ID } from "@/lib/types";

/** Minimal cookie-jar stand-in (node env has no document). */
function stubDocument() {
  (globalThis as { document?: { cookie: string } }).document = { cookie: "" };
}

describe("subscription cookie round-trip", () => {
  beforeEach(stubDocument);
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it("persists jurisdiction ids and include flags", () => {
    const subs = [
      { id: GLOBAL_ID, included: false },
      { id: ALBERTA_ID, included: true },
    ];
    writeSubscriptions(subs);
    expect(readSubscriptions()).toEqual(subs);
  });

  it("falls back to Global+Alberta (Alberta selected) when no cookie is set", () => {
    expect(readSubscriptions()).toEqual(DEFAULT_SUBSCRIPTIONS);
    expect(DEFAULT_SUBSCRIPTIONS).toEqual([
      { id: GLOBAL_ID, included: false },
      { id: ALBERTA_ID, included: true },
    ]);
  });

  it("falls back to the default set on a malformed cookie", () => {
    document.cookie = "oursay-subs=not-json";
    expect(readSubscriptions()).toEqual(DEFAULT_SUBSCRIPTIONS);
  });
});
describe("session cookie round-trip", () => {
  beforeEach(stubDocument);
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it("persists loggedIn, kycTier, and accountVisibility", () => {
    writeSession({ loggedIn: true, kycTier: 2, accountVisibility: "my_district" });
    expect(readSession()).toEqual({
      loggedIn: true,
      kycTier: 2,
      accountVisibility: "my_district",
    });
  });

  it("falls back to the anonymous default on a session without accountVisibility (old cookie)", () => {
    document.cookie = `oursay-session=${encodeURIComponent(
      JSON.stringify({ loggedIn: true, kycTier: 1 }),
    )}`;
    expect(readSession()).toEqual({
      loggedIn: true,
      kycTier: 1,
      accountVisibility: "anonymous",
    });
  });

  it("rejects an invalid visibility value", () => {
    document.cookie = `oursay-session=${encodeURIComponent(
      JSON.stringify({ loggedIn: false, kycTier: 0, accountVisibility: "everyone" }),
    )}`;
    expect(readSession().accountVisibility).toBe("anonymous");
  });

  it("returns the default on a malformed cookie", () => {
    document.cookie = "oursay-session=not-json";
    expect(readSession()).toEqual(DEFAULT_SESSION);
  });
});
