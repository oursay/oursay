import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRecordStates,
  attestResidency,
  devAttestKyc,
  devSetOfficialRole,
  getRecordStates,
  mapSigningPrefs,
  patchAccountVisibility,
  patchProfile,
  patchSigningPrefs,
  postShareMark,
  putJurisdictionMemberships,
  putThreadVisibility,
  stubApprovePoa,
  stubApproveIdentity,
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

  it("patchProfile PATCHes identity fields", async () => {
    mockFetch((url, init) => {
      expect(url).toContain("/v1/profile");
      expect(init?.method).toBe("PATCH");
      expect(init?.body).toContain("Hello");
      expect(init?.body).toContain("displayName");
      return Promise.resolve(new Response(JSON.stringify({ userId: "u1" }), { status: 200 }));
    });
    await patchProfile({
      handle: "pat_civic",
      displayName: "Pat",
      bio: "Hello",
      iconType: "glass",
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

  it("attestResidency falls back to stub POA when platform attest route is missing", async () => {
    let calls = 0;
    mockFetch((url, init) => {
      calls++;
      if (url.includes("/v1/kyc/residency/attest")) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }
      expect(url).toContain("/v1/dev/kyc/poa");
      expect(init?.method).toBe("POST");
      return Promise.resolve(
        new Response(JSON.stringify({ tier: "residency_verified" }), { status: 200 }),
      );
    });
    await attestResidency();
    expect(calls).toBe(2);
  });

  it("stubApprovePoa posts Didit-mimic stub POA", async () => {
    mockFetch((url, init) => {
      expect(url).toContain("/v1/dev/kyc/poa");
      expect(init?.method).toBe("POST");
      return Promise.resolve(
        new Response(JSON.stringify({ tier: "residency_verified" }), { status: 200 }),
      );
    });
    await stubApprovePoa();
  });

  it("stubApproveIdentity awards identity_verified only", async () => {
    mockFetch((url, init) => {
      expect(url).toContain("/v1/dev/kyc/attest");
      expect(init?.method).toBe("POST");
      expect(init?.body).toContain("identity_verified");
      return Promise.resolve(
        new Response(JSON.stringify({ tier: "identity_verified" }), { status: 200 }),
      );
    });
    await stubApproveIdentity();
  });

  it("devAttestKyc awards official role from residency without re-attesting KYC", async () => {
    mockFetch((url, init) => {
      expect(url).toContain("/v1/dev/official/role");
      expect(init?.method).toBe("POST");
      expect(init?.body).toContain("\"assign\":true");
      return Promise.resolve(
        new Response(JSON.stringify({ official: true, jurisdictionId: "ab-ca-gov" }), {
          status: 200,
        }),
      );
    });
    const next = await devAttestKyc(2);
    expect(next).toBe(3);
  });

  it("devAttestKyc revokes official role and attests unverified from official", async () => {
    const urls: string[] = [];
    mockFetch((url, init) => {
      urls.push(url);
      expect(init?.method).toBe("POST");
      if (url.includes("/v1/dev/official/role")) {
        expect(init?.body).toContain("\"assign\":false");
        return Promise.resolve(
          new Response(JSON.stringify({ official: false, jurisdictionId: "ab-ca-gov" }), {
            status: 200,
          }),
        );
      }
      expect(url).toContain("/v1/dev/kyc/attest");
      expect(init?.body).toContain("unverified");
      return Promise.resolve(
        new Response(JSON.stringify({ tier: "unverified" }), { status: 200 }),
      );
    });
    const next = await devAttestKyc(3);
    expect(next).toBe(0);
    expect(urls.some((u) => u.includes("/v1/dev/official/role"))).toBe(true);
    expect(urls.some((u) => u.includes("/v1/dev/kyc/attest"))).toBe(true);
  });

  it("devSetOfficialRole POSTs assign payload with Alberta district", async () => {
    mockFetch((url, init) => {
      expect(url).toContain("/v1/dev/official/role");
      expect(init?.method).toBe("POST");
      expect(init?.body).toContain("edmonton-strathcona");
      return Promise.resolve(
        new Response(JSON.stringify({ official: true, jurisdictionId: "ab-ca-gov" }), {
          status: 200,
        }),
      );
    });
    await devSetOfficialRole(true);
  });
});
