import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRecordStates,
  attestResidency,
  getRecordStates,
  mapSigningPrefs,
  patchAccountVisibility,
  patchProfile,
  patchSigningPrefs,
  postShareMark,
  putJurisdictionMemberships,
  putThreadVisibility,
} from "./me";

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => handler(url, init)));
}

describe("mapSigningPrefs", () => {
  it("merges server values over defaults", () => {
    const prefs = mapSigningPrefs({ vote: "passkey", comment: "quick" });
    expect(prefs.vote).toBe("passkey");
    expect(prefs.comment).toBe("quick");
    expect(prefs.reaction).toBe("quick");
  });
});

describe("applyRecordStates", () => {
  it("maps participation markers into app state maps", () => {
    const next = applyRecordStates(
      {
        "rec-1": {
          _my: "up",
          _myEntityId: "rx-1",
          _vote: "Yes",
          signed: true,
          shared: true,
        },
        "rec-2": { _my: null, _vote: null, signed: false, shared: false },
      },
      { reactions: {}, votes: {}, shared: {}, petitionSig: {} },
    );
    expect(next.reactions["rec-1"]).toEqual({ dir: "up", entityId: "rx-1" });
    expect(next.votes["rec-1"]).toBe("Yes");
    expect(next.shared["rec-1"]).toBe(true);
    expect(next.petitionSig["rec-1"]).toBe(1);
    expect(next.reactions["rec-2"]).toBeUndefined();
  });

  it("preserves a known reaction entity id when record-state omits _myEntityId", () => {
    const next = applyRecordStates(
      {
        "rec-1": { _my: "down", _vote: null, signed: false, shared: false },
      },
      {
        reactions: { "rec-1": { dir: "up", entityId: "rx-keep" } },
        votes: {},
        shared: {},
        petitionSig: {},
      },
    );
    expect(next.reactions["rec-1"]).toEqual({ dir: "down", entityId: "rx-keep" });
  });
});

describe("live /v1/me adapters", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_MOCK_ONLY = "0";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_MOCK_ONLY;
  });

  it("getRecordStates builds a repeatable ids query", async () => {
    mockFetch((url) => {
      expect(url).toContain("/v1/me/record-state?");
      expect(url).toContain("ids=a");
      expect(url).toContain("ids=b");
      return Promise.resolve(
        new Response(
          JSON.stringify({
            states: {
              a: { _my: "down", _vote: null, signed: false, shared: false },
            },
          }),
          { status: 200 },
        ),
      );
    });
    const states = await getRecordStates(["a", "b"]);
    expect(states.a?._my).toBe("down");
  });

  it("postShareMark POSTs to the share route", async () => {
    mockFetch((url, init) => {
      expect(url).toContain("/v1/me/shares/rec%3A1");
      expect(init?.method).toBe("POST");
      return Promise.resolve(
        new Response(JSON.stringify({ counted: true, count: 4 }), { status: 200 }),
      );
    });
    const res = await postShareMark("rec:1");
    expect(res).toEqual({ counted: true, count: 4 });
  });

  it("putThreadVisibility PUTs visibility body", async () => {
    mockFetch((url, init) => {
      expect(url).toContain("/v1/me/threads/thread-1/visibility");
      expect(init?.method).toBe("PUT");
      expect(init?.body).toBe(JSON.stringify({ visibility: "anonymous" }));
      return Promise.resolve(
        new Response(JSON.stringify({ visibility: "anonymous" }), { status: 200 }),
      );
    });
    await putThreadVisibility("thread-1", "anonymous");
  });

  it("patchAccountVisibility PATCHes /v1/me/visibility", async () => {
    mockFetch((url, init) => {
      expect(url).toContain("/v1/me/visibility");
      expect(init?.method).toBe("PATCH");
      return Promise.resolve(
        new Response(JSON.stringify({ visibility: "public" }), { status: 200 }),
      );
    });
    await patchAccountVisibility("public");
  });

  it("patchSigningPrefs returns merged prefs", async () => {
    mockFetch((url, init) => {
      expect(url).toContain("/v1/me/signing-prefs");
      expect(init?.method).toBe("PATCH");
      return Promise.resolve(
        new Response(JSON.stringify({ vote: "quick", comment: "ask" }), { status: 200 }),
      );
    });
    const prefs = await patchSigningPrefs({ vote: "quick" });
    expect(prefs.vote).toBe("quick");
    expect(prefs.comment).toBe("ask");
  });

  it("patchProfile PATCHes address fields", async () => {
    mockFetch((url, init) => {
      expect(url).toContain("/v1/profile");
      expect(init?.method).toBe("PATCH");
      expect(init?.body).toContain("Edmonton");
      return Promise.resolve(new Response(JSON.stringify({ userId: "u1" }), { status: 200 }));
    });
    await patchProfile({
      line1: "1 Main",
      city: "Edmonton",
      province: "AB",
      postalCode: "T5K 0A1",
      country: "CA",
    });
  });

  it("putJurisdictionMemberships PUTs jurisdiction ids", async () => {
    mockFetch((url, init) => {
      expect(url).toContain("/v1/me/jurisdictions");
      expect(init?.method).toBe("PUT");
      expect(init?.body).toContain("ab-ca-gov");
      return Promise.resolve(
        new Response(JSON.stringify({ jurisdictionIds: ["oursay-global", "ab-ca-gov"] }), {
          status: 200,
        }),
      );
    });
    await putJurisdictionMemberships([
      { id: "oursay-global", included: true },
      { id: "ab-ca-gov", included: true },
    ]);
  });

  it("attestResidency falls back to dev attest when route is missing", async () => {
    let calls = 0;
    mockFetch((url, init) => {
      calls++;
      if (url.includes("/v1/kyc/residency/attest")) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }
      expect(url).toContain("/v1/dev/kyc/attest");
      expect(init?.method).toBe("POST");
      return Promise.resolve(
        new Response(JSON.stringify({ tier: "residency_verified" }), { status: 200 }),
      );
    });
    await attestResidency();
    expect(calls).toBe(2);
  });
});
