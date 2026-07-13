import { describe, expect, it } from "vitest";
import { tierMatchedUpdateLabel, tierMatchedVerifyChoice } from "./tierUpdate";

describe("tierMatchedUpdate", () => {
  it("hides the shortcut while unverified", () => {
    expect(tierMatchedUpdateLabel(0)).toBeNull();
    expect(tierMatchedVerifyChoice(0)).toBeNull();
  });

  it("maps identity tier to ID Update / identity workflow", () => {
    expect(tierMatchedUpdateLabel(1)).toBe("ID Update");
    expect(tierMatchedVerifyChoice(1)).toBe("identity");
  });

  it("maps residency and official to Residency Update / poa", () => {
    expect(tierMatchedUpdateLabel(2)).toBe("Residency Update");
    expect(tierMatchedVerifyChoice(2)).toBe("poa");
    expect(tierMatchedUpdateLabel(3)).toBe("Residency Update");
    expect(tierMatchedVerifyChoice(3)).toBe("poa");
  });
});
