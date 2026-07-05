import type { RecordOption } from "@/lib/types";

export interface ResultOutcomeInfo {
  text: string;
  winner: "Support" | "Oppose";
  pct: number;
}

function fmtResultPct(n: number): string {
  const r = Math.round(n * 10) / 10;
  return r % 1 === 0 ? String(Math.round(r)) : r.toFixed(1);
}

/** Binary result copy: "Closed · N% Support|Oppose" — mirrors the wireframe. */
export function resultOutcomeInfo(
  options: RecordOption[],
  fallbackOutcome?: string,
): ResultOutcomeInfo {
  if (options.length >= 2) {
    const total = options.reduce((a, o) => a + o.v, 0) || 1;
    const sup = options.find((o) => o.label === "Support") ?? options[0];
    const opp = options.find((o) => o.label === "Oppose") ?? options[1];
    const supPct = (sup.v / total) * 100;
    const oppPct = (opp.v / total) * 100;
    const supportWins = supPct >= oppPct;
    const winner = supportWins ? "Support" : "Oppose";
    const winPct = supportWins ? supPct : oppPct;
    return {
      text: `Closed · ${fmtResultPct(winPct)}% ${winner}`,
      winner,
      pct: winPct / 100,
    };
  }

  const fallback = fallbackOutcome ?? "";
  return {
    text: fallback,
    winner: fallback.includes("Oppose") ? "Oppose" : "Support",
    pct:
      (parseFloat((fallback.match(/(\d+(?:\.\d+)?)\s*%/) ?? [])[1]) || 0) / 100,
  };
}
