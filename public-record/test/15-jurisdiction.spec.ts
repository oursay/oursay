// Jurisdiction layered gating (NO DB): resolveRules merges a jurisdiction's default rules with an
// entity's overrides, and the in-process router resolves a jurisdiction by id. Run standalone:
// `npx mocha test/15-jurisdiction.spec.ts`.
import { expect } from "chai";
import { resolveRules } from "../src/governance.js";
import { getJurisdiction, registerJurisdiction, jurisdictionConfig } from "../src/index.js";

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
