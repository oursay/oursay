import factsData from "./facts.json";

export interface Fact {
  id: string;
  value: string;
  claim: string;
  sourceName: string;
  sourceUrl: string;
  date: string;
  confidence: "Confirmed" | "Reported" | "Estimate" | "OurSay estimate";
}

export const facts: Fact[] = factsData as Fact[];

/** Zero-based position of a fact, used to derive its footnote number. */
export function factIndex(id: string): number {
  return facts.findIndex((f) => f.id === id);
}

export function getFact(id: string): Fact | undefined {
  return facts.find((f) => f.id === id);
}
