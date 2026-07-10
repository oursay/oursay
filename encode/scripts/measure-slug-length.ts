import { randomUUID } from "node:crypto";
import { encodeHexBase59, encodeUuidV4Base59 } from "../src/index.ts";

const samples = 10_000;
const hyphenated: number[] = [];
const base59: number[] = [];
const savings: number[] = [];

for (let i = 0; i < samples; i++) {
  const uuid = randomUUID();
  const enc = encodeUuidV4Base59(uuid);
  hyphenated.push(uuid.length);
  base59.push(enc.length);
  savings.push(uuid.length - enc.length);
}

function stats(arr: number[]) {
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = arr.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: (sum / arr.length).toFixed(2),
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
  };
}

console.log(`Random UUID v4 (n=${samples}):`);
console.log("  Hyphenated UUID:", stats(hyphenated));
console.log("  Base59 slug:    ", stats(base59));
console.log("  Chars saved:    ", stats(savings));

const examples = [
  "550e8400-e29b-41d4-a716-446655440000",
  "00000000-0000-4000-8000-000000000000",
  "ffffffff-ffff-4fff-8fff-ffffffffffff",
  randomUUID(),
  randomUUID(),
];
console.log("\nExamples:");
for (const uuid of examples) {
  const enc = encodeUuidV4Base59(uuid);
  const noHyp = uuid.replace(/-/g, "");
  console.log(`  ${uuid}`);
  console.log(
    `    hyphenated=${uuid.length}  hex=${noHyp.length}  base59=${enc.length}  slug=${enc}`,
  );
  console.log(
    `    saved vs hyphenated: ${uuid.length - enc.length}, vs hex: ${noHyp.length - enc.length}`,
  );
}

const maxPayload = "f".repeat(31);
const maxEnc = encodeHexBase59(maxPayload);
const minEnc = encodeUuidV4Base59("00000000-0000-4000-8000-000000000000");
console.log("\nBounds:");
console.log("  Max payload base59 length:", maxEnc.length);
console.log("  Min practical (mostly zeros):", minEnc.length, "->", minEnc);
