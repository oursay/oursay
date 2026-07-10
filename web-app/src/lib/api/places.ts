import { DISTRICT_BY_SLUG, getDistrictBySlug, JUR_DATA } from "@/lib/mock";
import type {
  DistrictDetail,
  DistrictSummary,
  JurisdictionSummary,
} from "@/lib/types";
import { apiGet, isMockOnly } from "./client";
import {
  mapDistrictDetail,
  mapDistrictSummary,
  mapJurisdictionSummary,
} from "./map";

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
