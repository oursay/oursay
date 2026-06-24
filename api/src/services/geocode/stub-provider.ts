// Deterministic, network-free geocoder for CI/dev. It resolves a point ONLY from a valid Canadian
// postal code (so behaviour is stable and offline); any other address resolves to null. The point is
// derived from a hash of the postal code, deterministically scattered inside an Alberta-ish bounding
// box — good enough for "does this address resolve?" wiring without external calls. NOT for production
// accuracy; the real provider (geocodio) is selected via config.

import { createHash } from "node:crypto";
import type { NormalizedAddress } from "../../helpers/address.js";
import type { GeocodeHit, GeocodeProvider } from "./provider.js";

// Alberta-ish bounding box (lon/lat). Points land inside Alberta so downstream point-in-polygon wiring
// has something plausible to chew on; exact placement is meaningless (it's a stub).
const LON_MIN = -120;
const LON_MAX = -110;
const LAT_MIN = 49;
const LAT_MAX = 60;
const CA_POSTAL = /^[A-Z]\d[A-Z] \d[A-Z]\d$/; // normalized "A1A 1A1"

/** Map 4 bytes of a digest to a float in [0,1). */
function unit(buf: Buffer, offset: number): number {
  return buf.readUInt32BE(offset) / 0x1_0000_0000;
}

export class StubGeocodeProvider implements GeocodeProvider {
  readonly name = "stub";

  async geocode(addr: NormalizedAddress): Promise<GeocodeHit | null> {
    if (addr.country !== "CA") return null;
    const postal = addr.postalCode ?? "";
    if (!CA_POSTAL.test(postal)) return null;
    const h = createHash("sha256").update(postal, "utf8").digest();
    const lon = LON_MIN + unit(h, 0) * (LON_MAX - LON_MIN);
    const lat = LAT_MIN + unit(h, 4) * (LAT_MAX - LAT_MIN);
    return { lon, lat, confidence: 0.5 };
  }
}
