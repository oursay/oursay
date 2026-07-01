import type { DistrictDetail } from "@/lib/types";

/** District view subject — the representative riding (wireframe DISTRICT). */
export const DISTRICT: DistrictDetail = {
  name: "Edmonton-Strathcona",
  slug: "edmonton-strathcona",
  jur: "Alberta",
  leader: "Rae Nguyen",
  boundaryYear: 2023,
  source: "Elections Alberta",
  about: [
    "Part of Alberta — provincial (ladder) rules apply.",
    "District-scoped posts use appliesToRegion: district.",
    "Only residency-verified electors count officially.",
    "Boundary: 2023 revision (Elections Alberta).",
    "Membership is inferred from your address, never stored.",
  ],
};
