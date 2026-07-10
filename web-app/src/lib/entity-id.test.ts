import { describe, expect, it } from "vitest";
import { encodeUuidV4Base59 } from "@oursay/encode";
import { encodeEntityIdForUrl, resolveEntityIdFromUrl } from "./entity-id";

const SAMPLE_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("encodeEntityIdForUrl", () => {
  it("encodes UUID v4 values as Base59", () => {
    expect(encodeEntityIdForUrl(SAMPLE_UUID)).to.equal(
      encodeUuidV4Base59(SAMPLE_UUID),
    );
    expect(encodeEntityIdForUrl(SAMPLE_UUID)).not.to.include("-");
  });

  it("passes mock corpus slugs through unchanged", () => {
    expect(encodeEntityIdForUrl("stmt-hana-ravine")).to.equal("stmt-hana-ravine");
  });
});

describe("resolveEntityIdFromUrl", () => {
  it("decodes Base59 URL segments to canonical UUID v4", () => {
    const slug = encodeUuidV4Base59(SAMPLE_UUID);
    expect(resolveEntityIdFromUrl(slug)).to.equal(SAMPLE_UUID);
  });

  it("accepts legacy raw UUID links", () => {
    expect(resolveEntityIdFromUrl(SAMPLE_UUID)).to.equal(SAMPLE_UUID);
    expect(resolveEntityIdFromUrl(SAMPLE_UUID.toUpperCase())).to.equal(SAMPLE_UUID);
  });

  it("passes mock corpus slugs through unchanged", () => {
    expect(resolveEntityIdFromUrl("pet-wei-path")).to.equal("pet-wei-path");
  });

  it("round-trips encode → resolve", () => {
    const uuid = crypto.randomUUID();
    expect(resolveEntityIdFromUrl(encodeEntityIdForUrl(uuid))).to.equal(
      uuid.toLowerCase(),
    );
  });
});
