import { describe, expect, it } from "vitest";
import { accountIdentity } from "./account-identity";
import type { AppState } from "./types";

const baseState = {
  loggedIn: true,
  accountHandle: "jane_alberta",
  accountDisplayName: "Jane Alberta",
} as AppState;

describe("accountIdentity", () => {
  it("returns live handle and display name when not in mock mode", () => {
    const prev = process.env.NEXT_PUBLIC_MOCK_ONLY;
    process.env.NEXT_PUBLIC_MOCK_ONLY = "0";
    try {
      expect(accountIdentity(baseState)).toEqual({
        name: "Jane Alberta",
        handle: "jane_alberta",
      });
    } finally {
      process.env.NEXT_PUBLIC_MOCK_ONLY = prev;
    }
  });

  it("falls back to handle when display name is empty", () => {
    const prev = process.env.NEXT_PUBLIC_MOCK_ONLY;
    process.env.NEXT_PUBLIC_MOCK_ONLY = "0";
    try {
      expect(
        accountIdentity({ ...baseState, accountDisplayName: "  " }),
      ).toEqual({
        name: "jane_alberta",
        handle: "jane_alberta",
      });
    } finally {
      process.env.NEXT_PUBLIC_MOCK_ONLY = prev;
    }
  });
});
