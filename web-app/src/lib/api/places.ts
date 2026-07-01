import { DISTRICT, JUR_DATA } from "@/lib/mock";
import type {
  DistrictDetail,
  DistrictSummary,
  JurisdictionSummary,
} from "@/lib/types";

/** A jurisdiction's summary (leader, rules, ridings). Looked up by name. */
export async function getJurisdiction(
  nameOrId: string,
): Promise<JurisdictionSummary | null> {
  return JUR_DATA[nameOrId] ?? null;
}

/** The ridings within a jurisdiction (empty for Global). */
export async function listDistricts(
  jurisdictionId: string,
): Promise<DistrictSummary[]> {
  return JUR_DATA[jurisdictionId]?.districts ?? [];
}

/**
 * A district's detail page. The mock ships one representative riding; a matching
 * slug returns it, and any other slug falls back to the same sample (the
 * wireframe's representative-target navigation).
 */
export async function getDistrict(slug: string): Promise<DistrictDetail> {
  return slug === DISTRICT.slug ? DISTRICT : { ...DISTRICT, slug };
}
