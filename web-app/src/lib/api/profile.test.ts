import { describe, expect, it } from "vitest";
import { getRecordEntry, MY_HANDLE, MY_NAME } from "@/lib/mock";
import { getProfile } from "./profile";

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
