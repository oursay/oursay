import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONTENT_DRAFTS_MAX,
  CONTENT_DRAFTS_STORAGE_KEY,
  clearCommentDraft,
  clearPostDraft,
  listContentDrafts,
  loadCommentDraft,
  loadPostDraft,
  saveCommentDraft,
  savePostDraft,
} from "./content-drafts";

function stubStorage() {
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
  return store;
}

describe("content drafts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    try {
      window.localStorage?.removeItem(CONTENT_DRAFTS_STORAGE_KEY);
    } catch {
      // ignore
    }
  });

  it("saves and loads a post draft per jurisdiction + record type", () => {
    stubStorage();
    savePostDraft("alberta", "statement", {
      title: "Hello",
      body: "World",
      pollOptions: ["", ""],
      districts: ["calgary-elbow"],
      visibility: "public",
    });
    expect(loadPostDraft("alberta", "statement")).toEqual({
      title: "Hello",
      body: "World",
      pollOptions: ["", ""],
      districts: ["calgary-elbow"],
      visibility: "public",
    });
    expect(loadPostDraft("alberta", "poll")).toBeNull();
    expect(loadPostDraft("global", "statement")).toBeNull();
  });

  it("saves and loads a comment draft per thread + parent", () => {
    stubStorage();
    saveCommentDraft("thread-1", "parent-a", { text: "Reply text" });
    expect(loadCommentDraft("thread-1", "parent-a")).toEqual({
      text: "Reply text",
    });
    expect(loadCommentDraft("thread-1", "parent-b")).toBeNull();
  });

  it("clears empty drafts instead of storing them", () => {
    stubStorage();
    savePostDraft("alberta", "statement", {
      title: "x",
      body: "",
      pollOptions: ["", ""],
      districts: [],
    });
    savePostDraft("alberta", "statement", {
      title: "",
      body: "",
      pollOptions: ["", ""],
      districts: [],
    });
    expect(loadPostDraft("alberta", "statement")).toBeNull();

    saveCommentDraft("t", "p", { text: "hi" });
    saveCommentDraft("t", "p", { text: "   " });
    expect(loadCommentDraft("t", "p")).toBeNull();
  });

  it("upserts the same key and updates updatedAt", () => {
    stubStorage();
    savePostDraft(
      "alberta",
      "poll",
      { title: "Q1", body: "", pollOptions: ["a", "b"], districts: [] },
      1000,
    );
    savePostDraft(
      "alberta",
      "poll",
      { title: "Q2", body: "", pollOptions: ["a", "b"], districts: [] },
      2000,
    );
    const all = listContentDrafts();
    expect(all).toHaveLength(1);
    expect(all[0]?.updatedAt).toBe(2000);
    expect(loadPostDraft("alberta", "poll")?.title).toBe("Q2");
  });

  it("drops the oldest draft when over the max of 50", () => {
    stubStorage();
    for (let i = 0; i < CONTENT_DRAFTS_MAX; i++) {
      saveCommentDraft("thread", `p-${i}`, { text: `d${i}` }, i + 1);
    }
    expect(listContentDrafts()).toHaveLength(CONTENT_DRAFTS_MAX);
    expect(loadCommentDraft("thread", "p-0")).toEqual({ text: "d0" });

    saveCommentDraft("thread", "p-new", { text: "newest" }, 10_000);
    expect(listContentDrafts()).toHaveLength(CONTENT_DRAFTS_MAX);
    expect(loadCommentDraft("thread", "p-0")).toBeNull();
    expect(loadCommentDraft("thread", "p-1")).toEqual({ text: "d1" });
    expect(loadCommentDraft("thread", "p-new")).toEqual({ text: "newest" });
  });

  it("clear helpers remove a single draft", () => {
    stubStorage();
    savePostDraft("alberta", "statement", {
      title: "t",
      body: "b",
      pollOptions: ["", ""],
      districts: [],
    });
    saveCommentDraft("t1", "p1", { text: "c" });
    clearPostDraft("alberta", "statement");
    clearCommentDraft("t1", "p1");
    expect(loadPostDraft("alberta", "statement")).toBeNull();
    expect(loadCommentDraft("t1", "p1")).toBeNull();
  });
});
