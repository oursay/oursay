import { expect } from "chai";
import {
  UUID_V4_VERSION_NIBBLE_INDEX,
  decodeUuidV4Base59,
  encodeUuidV4Base59,
  hexToUuid,
  insertUuidVersionNibble,
  isUuidV4,
  stripUuidVersionNibble,
  uuidToHex,
} from "../src/uuid-base59.js";

const SAMPLE_UUID = "550e8400-e29b-41d4-a716-446655440000";
const LEADING_ZERO_UUID = "00000000-0000-4000-8000-000000000000";

describe("uuid-base59", () => {
  it("validates UUID v4 layout", () => {
    expect(isUuidV4(SAMPLE_UUID)).to.equal(true);
    expect(isUuidV4("550e8400-e29b-31d4-a716-446655440000")).to.equal(false);
    expect(isUuidV4("not-a-uuid")).to.equal(false);
  });

  it("converts between hyphenated UUID and hex", () => {
    const hex = uuidToHex(SAMPLE_UUID);
    expect(hex).to.equal("550e8400e29b41d4a716446655440000");
    expect(hexToUuid(hex)).to.equal(SAMPLE_UUID);
  });

  it("strips and re-inserts the version nibble", () => {
    const hex = uuidToHex(SAMPLE_UUID);
    const payload = stripUuidVersionNibble(hex);
    expect(payload).to.have.length(31);
    expect(hex[UUID_V4_VERSION_NIBBLE_INDEX]).to.equal("4");
    expect(payload.slice(0, UUID_V4_VERSION_NIBBLE_INDEX)).to.equal(
      hex.slice(0, UUID_V4_VERSION_NIBBLE_INDEX),
    );
    expect(insertUuidVersionNibble(payload)).to.equal(hex);
  });

  it("round-trips a typical UUID v4", () => {
    const encoded = encodeUuidV4Base59(SAMPLE_UUID);
    expect(encoded).to.be.a("string");
    expect(encoded).to.not.include("-");
    expect(decodeUuidV4Base59(encoded)).to.equal(SAMPLE_UUID);
  });

  it("round-trips a UUID with many leading zero hex digits", () => {
    const encoded = encodeUuidV4Base59(LEADING_ZERO_UUID);
    expect(encoded.length).to.be.lessThan(22);
    expect(decodeUuidV4Base59(encoded)).to.equal(LEADING_ZERO_UUID);
  });

  it("round-trips random UUID v4 values", () => {
    for (let i = 0; i < 50; i += 1) {
      const uuid = crypto.randomUUID();
      expect(isUuidV4(uuid)).to.equal(true);
      expect(decodeUuidV4Base59(encodeUuidV4Base59(uuid))).to.equal(
        uuid.toLowerCase(),
      );
    }
  });

  it("rejects non-v4 UUIDs on encode", () => {
    expect(() =>
      encodeUuidV4Base59("6ba7b810-9dad-11d1-80b4-00c04fd430c8"),
    ).to.throw(/expected a UUID v4/);
  });

  it("rejects invalid Base59 on decode", () => {
    expect(() => decodeUuidV4Base59("not-valid!")).to.throw(
      /invalid Base59 character/,
    );
  });
});
