import { describe, expect, it } from "vitest";
import { getRecordEntry, MY_HANDLE, MY_NAME } from "@/lib/mock";
import type { VerificationTier, ViewerContext } from "@/lib/types";
import { getProfile } from "./profile";

function viewer(kycTier: VerificationTier, extra: Partial<ViewerContext> = {}): ViewerContext {
  return {
    loggedIn: kycTier > 0,
    kycTier,
    viewerDistricts: kycTier >= 2 ? ["edmonton-strathcona"] : [],
    ...extra,
  };
}

describe("getProfile (self account seed)", () => {
  it("resolves the signed-in account's handle", async () => {
    const profile = await getProfile(MY_HANDLE);
    expect(profile).not.toBeNull();
    expect(profile!.handle).toBe(MY_HANDLE);
    expect(profile!.name).toBe(MY_NAME);
  });

  it("resolves case-insensitively", async () => {
    const profile = await getProfile("Alex_Morgan");
    expect(profile?.handle).toBe(MY_HANDLE);
  });

  it("wires every seed post into the record corpus", async () => {
    const profile = await getProfile(MY_HANDLE);
    expect(profile!.posts.length).toBeGreaterThan(0);
    for (const post of profile!.posts) {
      expect(getRecordEntry(post.id), post.id).toBeDefined();
    }
  });

  it("has no dangling activity or mention recordIds", async () => {
    const profile = await getProfile(MY_HANDLE);
    for (const row of [...profile!.activity, ...profile!.mentions]) {
      expect(row.recordId).toBeDefined();
      expect(getRecordEntry(row.recordId!), row.recordId).toBeDefined();
    }
  });
});

describe("getProfile visibility gating (hide existence)", () => {
  it("hides samd (all_officials) below tier 3 and resolves at tier 3", async () => {
    expect(await getProfile("samd", { viewer: viewer(0) })).toBeNull();
    expect(await getProfile("samd", { viewer: viewer(2) })).toBeNull();
    expect((await getProfile("samd", { viewer: viewer(3) }))?.handle).toBe("samd");
  });

  it("hides pshah (my_district, calgary-elbow) from the edmonton viewer at every tier", async () => {
    for (const t of [0, 1, 2, 3] as const) {
      expect(await getProfile("pshah", { viewer: viewer(t) })).toBeNull();
    }
  });

  it("reveals priya (id_verified) from tier 1", async () => {
    expect(await getProfile("priya", { viewer: viewer(0) })).toBeNull();
    expect((await getProfile("priya", { viewer: viewer(1) }))?.handle).toBe("priya");
  });

  it("always resolves self, regardless of own visibility", async () => {
    const self = await getProfile(MY_HANDLE, {
      viewer: viewer(0, { loggedIn: true, selfHandle: MY_HANDLE, selfVisibility: "anonymous" }),
    });
    expect(self?.handle).toBe(MY_HANDLE);
  });

  it("resolves mention authors through the identity layer", async () => {
    const profile = await getProfile(MY_HANDLE, { viewer: viewer(0) });
    expect(profile!.mentions.length).toBeGreaterThan(0);
    for (const m of profile!.mentions) {
      expect(m.identity).toBeDefined();
      if (m.identity!.isPersona) {
        expect(m.author).toMatch(/^[A-Z][A-Za-z]+\d{2,}$/);
        expect(m.identity!.handle).toBeNull();
      }
    }
  });
});
