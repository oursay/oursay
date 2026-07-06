import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALBERTA_ID, GLOBAL_ID } from "@/lib/types";

const cookieSubs = [
  { id: GLOBAL_ID, included: true },
  { id: ALBERTA_ID, included: false },
];

vi.mock("@/lib/state/cookies", () => ({
  readSubscriptions: () => cookieSubs,
}));

vi.mock("./client", () => ({
  isMockOnly: () => false,
  apiGet: vi.fn(),
}));

import { apiGet } from "./client";
import { getJurisdictionMembership } from "./membership";

describe("getJurisdictionMembership (live)", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("merges server jurisdiction ids with cookie include flags", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      jurisdictionIds: [GLOBAL_ID, ALBERTA_ID, "bc-ca-gov"],
    });
    const subs = await getJurisdictionMembership();
    expect(subs).toEqual([
      { id: GLOBAL_ID, included: true },
      { id: ALBERTA_ID, included: false },
      { id: "bc-ca-gov", included: false },
    ]);
  });

  it("falls back to cookie subs when server returns empty", async () => {
    vi.mocked(apiGet).mockResolvedValue({ jurisdictionIds: [] });
    const subs = await getJurisdictionMembership();
    expect(subs).toEqual(cookieSubs);
  });
});
