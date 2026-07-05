import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SESSION, readSession, writeSession } from "./cookies";

/** Minimal cookie-jar stand-in (node env has no document). */
function stubDocument() {
  (globalThis as { document?: { cookie: string } }).document = { cookie: "" };
}

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
