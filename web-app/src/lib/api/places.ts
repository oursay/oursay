import { getDistrictBySlug, JUR_DATA } from "@/lib/mock";
import type {
  DistrictDetail,
  DistrictSummary,
  JurisdictionSummary,
} from "@/lib/types";

export async function getJurisdiction(
  nameOrId: string,
): Promise<JurisdictionSummary | null> {
  return JUR_DATA[nameOrId] ?? null;
}

export async function listDistricts(
  jurisdictionId: string,
): Promise<DistrictSummary[]> {
  return JUR_DATA[jurisdictionId]?.districts ?? [];
}

export async function getDistrict(slug: string): Promise<DistrictDetail | null> {
  return getDistrictBySlug(slug) ?? null;
}
