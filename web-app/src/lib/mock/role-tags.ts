import { ALBERTA_ID } from "@/lib/types";
import type { ProfileRoleTag } from "@/lib/types";
import { districtSeatHandle } from "@/lib/official-seat";
import type { MockPerson } from "./types";

export function mockRoleTagsFor(handle: string, person: MockPerson): ProfileRoleTag[] {
  if (handle === "ableg") {
    return [
      {
        roleLabel: "Legislature",
        placeLabel: "Alberta",
        jurisdictionId: ALBERTA_ID,
        districtSlug: null,
        seatHandle: null,
        placeKind: "jurisdiction",
      },
    ];
  }

  if (handle === "premier") {
    return [
      {
        roleLabel: "Premier",
        placeLabel: "Alberta",
        jurisdictionId: ALBERTA_ID,
        districtSlug: null,
        seatHandle: "ab-premier",
        placeKind: "jurisdiction",
      },
      {
        roleLabel: "MLA",
        placeLabel: "Calgary-Lougheed",
        jurisdictionId: ALBERTA_ID,
        districtSlug: "calgary-lougheed",
        seatHandle: "ab-cal_lough",
        placeKind: "district",
      },
    ];
  }

  if (handle === "oursay") {
    return [
      {
        roleLabel: "Platform",
        placeLabel: "Global",
        jurisdictionId: "oursay-global",
        districtSlug: null,
        seatHandle: "global-platform",
        placeKind: "jurisdiction",
      },
    ];
  }

  const role = person.role ?? "";
  const idx = role.indexOf(" · ");
  if (person.tier === 3 && idx !== -1) {
    const roleLabel = role.slice(0, idx);
    const placeLabel = role.slice(idx + 3);
    const districtSlug = person.districts?.[0] ?? null;
    return [
      {
        roleLabel,
        placeLabel,
        jurisdictionId: ALBERTA_ID,
        districtSlug,
        seatHandle: districtSlug ? districtSeatHandle(ALBERTA_ID, districtSlug) : null,
        placeKind: districtSlug ? "district" : "jurisdiction",
      },
    ];
  }

  return [];
}

export function mockRoleLine(tags: ProfileRoleTag[]): string {
  const first = tags[0];
  if (!first) return "Member";
  return first.placeLabel ? `${first.roleLabel} · ${first.placeLabel}` : first.roleLabel;
}
