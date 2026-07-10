import { describe, expect, it } from "vitest";
import { shareImageFilename } from "./image";

describe("shareImageFilename", () => {
  it("builds a png name from a record id", () => {
    expect(shareImageFilename("rec-abc")).toBe("oursay-rec-abc.png");
  });

  it("sanitizes comment share keys", () => {
    expect(shareImageFilename("rec-1::c::alice::2026-01-01T00:00:00Z")).toBe(
      "oursay-rec-1-c-alice-2026-01-01T00-00-00Z.png",
    );
  });
});
