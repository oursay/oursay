import { expect } from "chai";
import {
  AB_CA_GOV_BOUNDARY_SETS,
  boundarySetsFor,
  latestBoundarySet,
  resolveBoundarySet,
} from "../src/ingest/boundary-sets.js";

describe("boundary-sets registry", () => {
  it("lists Alberta sets and picks latest by effectiveDate", () => {
    expect(boundarySetsFor("ab-ca-gov").map((s) => s.id)).to.deep.equal(["2019", "2023"]);
    expect(boundarySetsFor("oursay-global")).to.deep.equal([]);
    expect(latestBoundarySet("ab-ca-gov")?.id).to.equal("2023");
    expect(latestBoundarySet("oursay-global")).to.equal(undefined);
  });

  it("resolves named sets and latest", () => {
    expect(resolveBoundarySet("ab-ca-gov", "2019").boundaryYear).to.equal(2019);
    expect(resolveBoundarySet("ab-ca-gov", "latest").id).to.equal("2023");
    expect(resolveBoundarySet("ab-ca-gov").effectiveDate).to.equal(
      AB_CA_GOV_BOUNDARY_SETS.find((s) => s.id === "2023")!.effectiveDate,
    );
    expect(() => resolveBoundarySet("ab-ca-gov", "1999")).to.throw(/Unknown boundary set/);
    expect(() => resolveBoundarySet("oursay-global")).to.throw(/no boundary datasets/);
  });

  it("builds a ShapefileSource for each Alberta set", () => {
    for (const set of AB_CA_GOV_BOUNDARY_SETS) {
      const source = set.build();
      expect(source.jurisdictionId).to.equal("ab-ca-gov");
      expect(source.boundaryYear).to.equal(set.boundaryYear);
      expect(source.effectiveDate).to.equal(set.effectiveDate);
    }
  });
});
