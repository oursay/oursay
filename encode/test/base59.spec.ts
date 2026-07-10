import { expect } from "chai";
import {
  BASE59_ALPHABET,
  bigIntToHex,
  decodeBase59,
  decodeHexBase59,
  encodeBase59,
  encodeHexBase59,
  hexToBigInt,
  stripLeadingZeroHex,
} from "../src/base59.js";

describe("base59", () => {
  it("uses 59 symbols (Base58 + underscore)", () => {
    expect(BASE59_ALPHABET).to.have.length(59);
    expect(BASE59_ALPHABET.endsWith("_")).to.equal(true);
    expect(new Set(BASE59_ALPHABET).size).to.equal(59);
  });

  it("round-trips integers through Base59", () => {
    for (const value of [0n, 1n, 58n, 59n, 123456789n, 2n ** 124n - 1n]) {
      expect(decodeBase59(encodeBase59(value))).to.equal(value);
    }
  });

  it("encodes zero as the alphabet's first digit", () => {
    expect(encodeBase59(0n)).to.equal(BASE59_ALPHABET[0]);
  });

  it("strips leading zero hex digits", () => {
    expect(stripLeadingZeroHex("000abc")).to.equal("abc");
    expect(stripLeadingZeroHex("0000")).to.equal("0");
    expect(stripLeadingZeroHex("0")).to.equal("0");
  });

  it("round-trips hex via Base59 with leading-zero strip", () => {
    const hex = "000000000000000080000000000000";
    const encoded = encodeHexBase59(hex);
    expect(decodeHexBase59(encoded, hex.length)).to.equal(hex);
  });

  it("round-trips hex ↔ BigInt", () => {
    const hex = "deadbeef";
    expect(bigIntToHex(hexToBigInt(hex))).to.equal(hex);
  });

  it("rejects invalid Base59 characters", () => {
    expect(() => decodeBase59("0")).to.throw(/invalid Base59 character/);
    expect(() => decodeBase59("O")).to.throw(/invalid Base59 character/);
  });

  it("rejects decoded hex wider than minHexLength", () => {
    const encoded = encodeHexBase59("ffff");
    expect(() => decodeHexBase59(encoded, 2)).to.throw(/exceeds minimum width/);
  });
});
