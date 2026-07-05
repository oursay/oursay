// Jurisdiction layered gating (NO DB): resolveRules merges a jurisdiction's default rules with an
// entity's overrides, and the in-process router resolves a jurisdiction by id. Run standalone:
// `npx mocha test/15-jurisdiction.spec.ts`.
import { expect } from "chai";
import { resolveRules } from "../src/governance.js";
import {
  DEFAULT_CONTENT_LIMITS,
  DEFAULT_LABELS,
  getJurisdiction,
  registerJurisdiction,
  jurisdictionConfig,
} from "../src/index.js";

describe("15 jurisdiction: layered rule resolution (default ⊕ entity override)", () => {
  it("applies the jurisdiction default when the entity sets no rule", () => {
    const r = resolveRules({ allowChange: true }, {});
    expect(r.allowChange).to.equal(true);
    expect(r.allowRevoke).to.equal(false); // absent default stays final-action
  });

  it("lets the entity override the jurisdiction default (tighten)", () => {
    const r = resolveRules({ allowChange: true, allowRevoke: true }, { allowChange: false });
    expect(r.allowChange).to.equal(false); // entity wins
    expect(r.allowRevoke).to.equal(true); // jurisdiction default still applies
  });

  it("lets the entity opt in when the jurisdiction default is final", () => {
    const r = resolveRules({}, { allowChange: true });
    expect(r.allowChange).to.equal(true);
  });

  it("prefers the entity deadline, else the jurisdiction default deadline", () => {
    const ENTITY = "2030-01-01T00:00:00.000Z";
    const DEFAULT = "2029-01-01T00:00:00.000Z";
    expect(resolveRules({ defaultDeadline: DEFAULT }, { deadline: ENTITY }).deadline).to.equal(ENTITY);
    expect(resolveRules({ defaultDeadline: DEFAULT }, {}).deadline).to.equal(DEFAULT);
  });

  it("carries appliesToDistrictIds through untouched (absent = whole jurisdiction)", () => {
    expect(resolveRules({}, { appliesToDistrictIds: ["edmonton-strathcona-2026"] }).appliesToDistrictIds).to.deep.equal([
      "edmonton-strathcona-2026",
    ]);
    expect(resolveRules({}, {}).appliesToDistrictIds).to.equal(undefined);
  });

  it("carries appliesToRegion (the canonical stake) through untouched", () => {
    const ref = { op: "or" as const, refs: ["district:edmonton-strathcona", "revision:calgary-buffalo-2019"] };
    expect(resolveRules({}, { appliesToRegion: ref }).appliesToRegion).to.deep.equal(ref);
    expect(resolveRules({}, { appliesToRegion: "jurisdiction" }).appliesToRegion).to.equal("jurisdiction");
    expect(resolveRules({}, {}).appliesToRegion).to.equal(undefined);
  });
});

describe("15 jurisdiction: router", () => {
  it("defaults to the deployment's configured jurisdiction", () => {
    expect(getJurisdiction().id).to.equal(jurisdictionConfig.id);
  });

  it("resolves a registered jurisdiction by id; falls back to the default for unknown ids", () => {
    registerJurisdiction({ id: "bc-ca-gov", level: "provincial", rules: { allowChange: true } });
    expect(getJurisdiction("bc-ca-gov").rules.allowChange).to.equal(true);
    expect(getJurisdiction("bc-ca-gov").level).to.equal("provincial");
    expect(getJurisdiction("does-not-exist").id).to.equal(jurisdictionConfig.id);
  });
});

// Mirrors the @oursay/jurisdiction-data configs (public-record can't import that package — it would be
// a dependency cycle), exercising the labels/contentLimits seam through the same getJurisdiction() path.
// The shipped data-package values are asserted end-to-end in api/test/19-public-area-catalog.spec.ts.
describe("15 jurisdiction: labels + contentLimits resolve via getJurisdiction()", () => {
  it("resolves Alberta's per-record-type labels and content caps", () => {
    registerJurisdiction({
      id: "ab-ca-gov",
      level: "provincial",
      rules: { allowChange: false, allowRevoke: false },
      labels: { ...DEFAULT_LABELS, post: "Statement", district: "riding" },
      contentLimits: DEFAULT_CONTENT_LIMITS,
    });
    const ab = getJurisdiction("ab-ca-gov");
    expect(ab.labels?.post).to.equal("Statement");
    expect(ab.labels?.district).to.equal("riding");
    expect(ab.labels?.poll).to.equal("Poll");
    expect(ab.contentLimits?.petition?.text).to.equal(5000);
    expect(ab.contentLimits?.poll?.maxOptions).to.equal(10);
  });

  it("resolves the global jurisdiction to all platform defaults", () => {
    registerJurisdiction({
      id: "oursay-global",
      level: "federal",
      rules: { allowChange: true, allowRevoke: true },
      labels: { ...DEFAULT_LABELS },
      contentLimits: DEFAULT_CONTENT_LIMITS,
    });
    const g = getJurisdiction("oursay-global");
    expect(g.labels).to.deep.equal(DEFAULT_LABELS);
    expect(g.contentLimits).to.deep.equal(DEFAULT_CONTENT_LIMITS);
  });
});
