import { describe, expect, it } from "vitest";
import { NOW } from "@/lib/mock";
import { absDate, relTime } from "./rel-time";

/** ISO string for an instant `minutes` before NOW. */
function before(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60000).toISOString();
}

describe("absDate", () => {
  it("returns the YYYY-MM-DD prefix of an ISO timestamp", () => {
    expect(absDate("2026-06-22T10:15:00.000Z")).toBe("2026-06-22");
    expect(absDate("2026-07-16T20:00:00Z")).toBe("2026-07-16");
  });
});

describe("relTime", () => {
  it("returns 'just now' under two minutes", () => {
    expect(relTime(before(0.5), NOW)).toBe("just now");
    expect(relTime(before(1), NOW)).toBe("just now");
    expect(relTime(before(1.9), NOW)).toBe("just now");
  });

  it("returns minutes under an hour", () => {
    expect(relTime(before(2), NOW)).toBe("2m ago");
    expect(relTime(before(5), NOW)).toBe("5m ago");
    expect(relTime(before(59), NOW)).toBe("59m ago");
  });

  it("returns hours under a day", () => {
    expect(relTime(before(3 * 60), NOW)).toBe("3h ago");
    expect(relTime(before(23 * 60), NOW)).toBe("23h ago");
  });

  it("returns days up to and including 6 days", () => {
    expect(relTime(before(2 * 24 * 60), NOW)).toBe("2d ago");
    expect(relTime(before(6 * 24 * 60), NOW)).toBe("6d ago");
  });

  it("returns an absolute YYYY-MM-DD past 6 days", () => {
    // The Hana Okafor statement sample is the wireframe's >6d case.
    expect(relTime("2026-06-22T10:15:00", NOW)).toBe("2026-06-22");
  });
});
