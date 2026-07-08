import { describe, expect, it } from "vitest";
import { seatTitle } from "@oursay/slugs";
import { districtSlug, districtShortSlug, districtSeatHandle, jurisdictionLeaderSeatHandle } from "./slug";
import { districtSeatHandle as officialSeatHandle } from "../official-seat";

// Drift guard: these fixtures MUST stay identical to @oursay/jurisdiction-data lib/slugs.ts
// (and the @oursay/geo districtSlug). web-app cannot import that package into the client bundle
// yet (see TODO(slug-promotion) in official-seat.ts + plan R8 follow-up), so these fixtures lock
// the copied algorithm against silent drift. If jurisdiction-data changes, update BOTH.
describe("slug (drift guard vs @oursay/jurisdiction-data)", () => {
  it("districtSlug: stable, year-less, accent-folded", () => {
    expect(districtSlug("Edmonton-Strathcona")).toBe("edmonton-strathcona");
    expect(districtSlug("Calgary-Bow")).toBe("calgary-bow");
    expect(districtSlug("Grande Prairie")).toBe("grande-prairie");
    expect(districtSlug("Rivière")).toBe("riviere");
  });

  it("districtShortSlug: compact seat key", () => {
    expect(districtShortSlug("edmonton-strathcona")).toBe("edm_strth");
    expect(districtShortSlug("calgary-bow")).toBe("cal_bow");
    expect(districtShortSlug("brooks-medicine-hat")).toBe("bro_med_hat");
  });

  it("districtSeatHandle: <jurShort>-<shortSlug>", () => {
    // mock/slug variant takes the jurisdiction short slug directly
    expect(districtSeatHandle("ab", "edmonton-strathcona")).toBe("ab-edm_strth");
    // official-seat variant maps a jurisdiction id -> short slug then delegates
    expect(officialSeatHandle("ab-ca-gov", "edmonton-strathcona")).toBe("ab-edm_strth");
    expect(officialSeatHandle("ab-ca-gov", "brooks-medicine-hat")).toBe("ab-bro_med_hat");
  });

  it("jurisdictionLeaderSeatHandle: <jurShort>-<role>", () => {
    expect(jurisdictionLeaderSeatHandle("ab", "premier")).toBe("ab-premier");
  });

  it("seatTitle: kind + leaderRole ladder (shared by geo ingest + jurisdiction-data catalog)", () => {
    expect(seatTitle({ seatKind: "district_mla" })).toBe("District MLA");
    expect(seatTitle({ seatKind: "jurisdiction_leader", leaderRole: "premier" })).toBe("Alberta Premier");
    expect(seatTitle({ seatKind: "jurisdiction_leader", leaderRole: "platform" })).toBe("Platform · Global");
    expect(seatTitle({ seatKind: "jurisdiction_leader" })).toBe("Jurisdiction Leader");
  });
});
