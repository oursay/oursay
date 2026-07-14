import { describe, expect, it } from "vitest";
import { handleValidationError, normalizeHandleBody, wireHandle, displayHandle } from "./handle";

describe("handle", () => {
  it("accepts underscore and hyphen handles", () => {
    expect(normalizeHandleBody("jane_alberta")).toBe("jane_alberta");
    expect(normalizeHandleBody("@jane-alberta")).toBe("jane-alberta");
  });

  it("rejects dots and spaces", () => {
    expect(normalizeHandleBody("jane.alberta")).toBeNull();
    expect(normalizeHandleBody("Jane Alberta")).toBeNull();
    expect(handleValidationError("a@oursay.ca")).toMatch(/hyphens/i);
  });

  it("rejects short handles and digit-only handles", () => {
    expect(normalizeHandleBody("ab")).toBeNull();
    expect(handleValidationError("ab")).toMatch(/3 characters/i);
    expect(normalizeHandleBody("123")).toBeNull();
    expect(handleValidationError("123")).toMatch(/letter/i);
    expect(normalizeHandleBody("12_")).toBeNull();
    expect(normalizeHandleBody("ab1")).toBe("ab1");
  });

  it("strips @ for wire handles", () => {
    expect(wireHandle("@jane_alberta")).toBe("jane_alberta");
    expect(wireHandle("jane_alberta")).toBe("jane_alberta");
    expect(wireHandle("")).toBeUndefined();
  });

  it("formats display handle with single @", () => {
    expect(displayHandle("@jane_alberta")).toBe("@jane_alberta");
    expect(displayHandle("jane_alberta")).toBe("@jane_alberta");
  });
});
