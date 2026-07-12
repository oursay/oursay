import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adjectives, colors, animals, names, countries, languages, starWars } from "unique-names-generator";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "unique-names-generator-dictionaries.txt");

const dictionaries = {
  adjectives,
  colors,
  animals,
  names,
  countries,
  languages,
  starWars,
};

const lines = [
  "# unique-names-generator dictionary dump",
  `# Source: unique-names-generator (imported)`,
  `# Generated: ${new Date().toISOString()}`,
  "",
];

// Pools actually used by persona-name.ts (length <= 7)
const shortAdj = [...adjectives, ...colors]
  .filter((w) => w.length <= 7)
  .sort((a, b) => a.localeCompare(b));
const shortNoun = [...animals, ...names]
  .filter((w) => w.length <= 7)
  .sort((a, b) => a.localeCompare(b));

lines.push("=".repeat(72));
lines.push("PERSONA NAME POOLS (length <= 7) — what generation actually uses");
lines.push("=".repeat(72));
lines.push("");
lines.push(`--- adjectives+colors (len<=7) — ${shortAdj.length} words ---`);
lines.push(...shortAdj);
lines.push("");
lines.push(`--- animals+names (len<=7) — ${shortNoun.length} words ---`);
lines.push(...shortNoun);
lines.push("");

for (const [name, words] of Object.entries(dictionaries)) {
  const sorted = [...words].sort((a, b) => a.localeCompare(b));
  lines.push("=".repeat(72));
  lines.push(`${name.toUpperCase()} — full list (${sorted.length} words)`);
  lines.push("=".repeat(72));
  lines.push(...sorted);
  lines.push("");
}

mkdirSync(__dirname, { recursive: true });
writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`Wrote ${outPath}`);
for (const [name, words] of Object.entries(dictionaries)) {
  console.log(`  ${name}: ${words.length}`);
}
console.log(`  short adj+colors: ${shortAdj.length}`);
console.log(`  short animals+names: ${shortNoun.length}`);
