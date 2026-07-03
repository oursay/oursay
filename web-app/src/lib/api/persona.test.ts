import { describe, expect, it } from "vitest";
import { getPersonaActivity } from "./persona";
import { personaFor } from "./identity";

describe("getPersonaActivity", () => {
  it("resolves a persona's activity scoped to its thread", async () => {
    // samd is the pet-sam-109st author and anonymized there for everyone
    // (thread override -> anonymous).
    const persona = personaFor("samd", "pet-sam-109st");
    const activity = await getPersonaActivity("pet-sam-109st", persona);
    expect(activity).not.toBeNull();
    expect(activity!.personaName).toBe(persona);
    expect(activity!.threadId).toBe("pet-sam-109st");
    expect(activity!.threadKind).toBe("petition");
    expect(activity!.items.some((i) => i.kind === "post")).toBe(true);
    // Tier stays visible — civic signal, not identity.
    expect(activity!.tier).toBe(2);
  });

  it("returns null for an unknown thread", async () => {
    expect(await getPersonaActivity("no-such-thread", "BraveOtter42")).toBeNull();
  });

  it("returns null for an unknown persona name on a real thread", async () => {
    expect(await getPersonaActivity("pet-sam-109st", "NotAPersona00")).toBeNull();
  });

  it("returns null when probed with a real handle instead of a persona name", async () => {
    expect(await getPersonaActivity("pet-sam-109st", "samd")).toBeNull();
  });
});
