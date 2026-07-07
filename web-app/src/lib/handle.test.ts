import { describe, expect, it } from "vitest";
import { handleValidationError, normalizeHandleBody } from "./handle";

describe("handle", () => {
  it("accepts underscore handles", () => {
    expect(normalizeHandleBody("jane_alberta")).toBe("jane_alberta");
    expect(normalizeHandleBody("@jane_alberta")).toBe("jane_alberta");
  });

  it("rejects dots and spaces", () => {
    expect(normalizeHandleBody("jane.alberta")).toBeNull();
    expect(normalizeHandleBody("Jane Alberta")).toBeNull();
    expect(handleValidationError("a@oursay.ca")).toMatch(/underscore/i);
  });
});
