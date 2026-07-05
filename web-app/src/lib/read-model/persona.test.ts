import { describe, expect, it } from "vitest";
import { buildPersonaMap, personaNameFor } from "./persona";

describe("personaNameFor", () => {
  it("is deterministic for the same (handle, thread)", () => {
    expect(personaNameFor("pshah", "stmt-1")).toBe(personaNameFor("pshah", "stmt-1"));
  });

  it("matches <Adjective><Animal><NN> with a 2+ digit suffix", () => {
    expect(personaNameFor("pshah", "stmt-1")).toMatch(/^[A-Z][A-Za-z]+\d{2,}$/);
    expect(personaNameFor("pshah", "stmt-1", 3)).toMatch(/\d{3}$/);
  });

  it("gives the same author different names in different threads", () => {
    const threads = ["stmt-1", "pet-2", "poll-3", "stmt-hana-ravine"];
    const names = new Set(threads.map((t) => personaNameFor("pshah", t)));
    expect(names.size).toBe(threads.length);
  });

  it("gives different authors different names in the same thread", () => {
    const handles = ["pshah", "dwhitecloud", "kevinTO", "rosak", "lenapark"];
    const names = new Set(handles.map((h) => personaNameFor(h, "stmt-1")));
    expect(names.size).toBe(handles.length);
  });
});

describe("buildPersonaMap", () => {
  it("assigns every participant a unique name, deduplicating handles", () => {
    const map = buildPersonaMap(["b", "a", "c", "a"], "thread-x");
    expect(map.size).toBe(3);
    expect(new Set(map.values()).size).toBe(3);
  });

  it("is independent of participant order", () => {
    const sorted = buildPersonaMap(["a", "b", "c"], "thread-x");
    const shuffled = buildPersonaMap(["c", "a", "b"], "thread-x");
    expect([...shuffled.entries()].sort()).toEqual([...sorted.entries()].sort());
  });

  it("grows the digit count on collision (later handle in sort order retries)", () => {
    // Forced collisions: every handle produces "Same" + a digits-wide marker,
    // so "a" takes Same@2, "b" collides at 2 and lands on 3, "c" on 4.
    const nameAt = (handle: string, _thread: string, digits: number) =>
      digits === 2 ? "Same42" : `Same${handle}${digits}`;
    const map = buildPersonaMap(["c", "b", "a"], "thread-x", nameAt);
    expect(map.get("a")).toBe("Same42");
    expect(map.get("b")).toBe("Sameb3");
    expect(map.get("c")).toBe("Samec3");
  });

  it("keeps retrying while names still collide", () => {
    const nameAt = (handle: string, _thread: string, digits: number) =>
      digits < 4 ? "Stuck00" : `Free${handle}${digits}`;
    const map = buildPersonaMap(["a", "b"], "thread-x", nameAt);
    expect(map.get("a")).toBe("Stuck00");
    expect(map.get("b")).toBe("Freeb4");
  });
});
