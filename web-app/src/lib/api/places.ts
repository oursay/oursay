import { DEFAULT_CONTENT_LIMITS } from "@oursay/content-limits";
import { DISTRICT_BY_SLUG, getDistrictBySlug, JUR_DATA } from "@/lib/mock";
import type {
  DistrictDetail,
  DistrictSummary,
  JurisdictionContentLimits,
  JurisdictionSummary,
} from "@/lib/types";
import { ALBERTA_ID, GLOBAL_ID } from "@/lib/types";
import { apiGet, isMockOnly } from "./client";
import {
  mapDistrictDetail,
  mapDistrictSummary,
  mapJurisdictionSummary,
} from "./map";

/** Content caps keyed by jurisdiction id (page-load snapshot for composers). */
export type ContentLimitsByJurisdiction = Record<
  string,
  JurisdictionContentLimits
>;

/**
 * Mock catalog mirrors `@oursay/jurisdiction-data` (Global = platform defaults;
 * Alberta raises poll.question/option). Live mode replaces this from the API.
 */
const MOCK_CONTENT_LIMITS: ContentLimitsByJurisdiction = {
  [GLOBAL_ID]: DEFAULT_CONTENT_LIMITS,
  [ALBERTA_ID]: {
    ...DEFAULT_CONTENT_LIMITS,
    poll: {
      ...DEFAULT_CONTENT_LIMITS.poll,
      question: 400,
      option: 200,
    },
  },
};

function mapContentLimits(raw: unknown): JurisdictionContentLimits {
  if (!raw || typeof raw !== "object") return DEFAULT_CONTENT_LIMITS;
  return raw as JurisdictionContentLimits;
}

async function listJurisdictionContentLimitsMock(): Promise<ContentLimitsByJurisdiction> {
  return { ...MOCK_CONTENT_LIMITS };
}

async function listJurisdictionContentLimitsLive(): Promise<ContentLimitsByJurisdiction> {
  const res = await apiGet<{
    items: Array<{ id?: unknown; contentLimits?: unknown }>;
  }>("/v1/public/jurisdictions");
  const out: ContentLimitsByJurisdiction = {};
  for (const item of res?.items ?? []) {
    const id = typeof item.id === "string" ? item.id : "";
    if (!id) continue;
    out[id] = mapContentLimits(item.contentLimits);
  }
  return out;
}

/**
 * Load per-jurisdiction content caps from `GET /v1/public/jurisdictions`.
 * Call once at page load and keep the snapshot for the session so composers
 * enforce the same limits the API would reject (until the next reload).
 */
export async function listJurisdictionContentLimits(): Promise<ContentLimitsByJurisdiction> {
  if (isMockOnly()) return listJurisdictionContentLimitsMock();
  return listJurisdictionContentLimitsLive();
}

async function getJurisdictionMock(
  nameOrId: string,
): Promise<JurisdictionSummary | null> {
  return JUR_DATA[nameOrId] ?? null;
}

async function getJurisdictionLive(
  jurisdictionId: string,
): Promise<JurisdictionSummary | null> {
  const [detail, districtsRes] = await Promise.all([
    apiGet<Record<string, unknown>>(
      `/v1/public/jurisdictions/${encodeURIComponent(jurisdictionId)}`,
    ),
    apiGet<{ items: Record<string, unknown>[] }>(
      `/v1/public/jurisdictions/${encodeURIComponent(jurisdictionId)}/districts`,
    ),
  ]);
  if (!detail) return null;

  const districts = (districtsRes?.items ?? []).map((row) =>
    mapDistrictSummary(row, jurisdictionId),
  );
  return mapJurisdictionSummary(detail, districts);
}

export async function getJurisdiction(
  nameOrId: string,
): Promise<JurisdictionSummary | null> {
  if (isMockOnly()) return getJurisdictionMock(nameOrId);
  return getJurisdictionLive(nameOrId);
}

async function listDistrictsMock(
  jurisdictionId: string,
): Promise<DistrictSummary[]> {
  return JUR_DATA[jurisdictionId]?.districts ?? [];
}

async function listDistrictsLive(
  jurisdictionId: string,
): Promise<DistrictSummary[]> {
  const res = await apiGet<{ items: Record<string, unknown>[] }>(
    `/v1/public/jurisdictions/${encodeURIComponent(jurisdictionId)}/districts`,
  );
  return res?.items.map((row) => mapDistrictSummary(row, jurisdictionId)) ?? [];
}

export async function listDistricts(
  jurisdictionId: string,
): Promise<DistrictSummary[]> {
  if (isMockOnly()) return listDistrictsMock(jurisdictionId);
  return listDistrictsLive(jurisdictionId);
}

async function getDistrictMock(slug: string): Promise<DistrictDetail | null> {
  return getDistrictBySlug(slug) ?? null;
}

async function getDistrictLive(
  slug: string,
  jurisdictionId?: string,
): Promise<DistrictDetail | null> {
  const jurId = jurisdictionId ?? DISTRICT_BY_SLUG[slug]?.jur;
  if (!jurId) return null;

  const raw = await apiGet<Record<string, unknown>>(
    `/v1/public/jurisdictions/${encodeURIComponent(jurId)}/districts/${encodeURIComponent(slug)}`,
  );
  return raw ? mapDistrictDetail(raw) : null;
}

export async function getDistrict(
  slug: string,
  opts?: { jurisdictionId?: string },
): Promise<DistrictDetail | null> {
  if (isMockOnly()) return getDistrictMock(slug);
  return getDistrictLive(slug, opts?.jurisdictionId);
}
