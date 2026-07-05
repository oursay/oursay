import { describe, expect, it } from "vitest";
import { getPersonaProfile } from "./persona";
import { lookupPersona, personaFor, personaMapForThread } from "./identity";

describe("getPersonaProfile", () => {
  it("resolves a persona profile from its name alone", async () => {
    // samd is the pet-sam-109st author and anonymized there for everyone
    // (thread override -> anonymous).
    const persona = personaFor("samd", "pet-sam-109st");
    const profile = await getPersonaProfile(persona);
    expect(profile).not.toBeNull();
    expect(profile!.name).toBe(persona);
    expect(profile!.threadId).toBe("pet-sam-109st");
    expect(profile!.threadKind).toBe("petition");
    // Tier stays visible — civic signal, not identity.
    expect(profile!.tier).toBe(2);
    // The root post lands in activity ("Posted …"), not comments.
    expect(profile!.activity.some((a) => a.text.startsWith("Posted"))).toBe(true);
    expect(profile!.activity.every((a) => !a.text.startsWith("Commented"))).toBe(true);
    // Support pill is comment-count only.
    expect(profile!.support.statements).toBe(0);
    expect(profile!.support.comments).toBe(profile!.comments.length);
  });

  it("rewrites the persona's own comments to the persona identity", async () => {
    // Pick any thread participant who actually commented.
    const map = personaMapForThread("pet-wei-path");
    const [handle, persona] = [...map.entries()].find(([h]) => h !== "weichen")!;
    const profile = await getPersonaProfile(persona);
    expect(profile).not.toBeNull();
    for (const c of profile!.comments) {
      expect(c.author).toBe(persona);
      expect(c.identity?.isPersona).toBe(true);
      expect(c.identity?.handle).toBeNull();
      expect(JSON.stringify(c)).not.toContain(handle);
    }
  });

  it("mention authors resolve through the identity layer for the viewer", async () => {
    const persona = personaFor("samd", "pet-sam-109st");
    const profile = await getPersonaProfile(persona);
    for (const m of profile!.mentions) {
      expect(m.identity).toBeDefined();
      expect(m.recordId).toBe("pet-sam-109st");
    }
  });

  it("returns null for unknown names and real-handle probes", async () => {
    expect(await getPersonaProfile("NotAPersona00")).toBeNull();
    expect(await getPersonaProfile("samd")).toBeNull();
  });

  it("persona names are globally unique across threads", () => {
    // lookupPersona resolves each roster name back to exactly its thread.
    for (const threadId of ["pet-sam-109st", "stmt-dana-transit", "pet-wei-path"]) {
      for (const [handle, name] of personaMapForThread(threadId)) {
        expect(lookupPersona(name)).toEqual({ handle, threadId });
      }
    }
  });
});
