import { listFeedItems } from "@/lib/api";
import type { FeedItem } from "@/lib/types";

// Minimal health route: proves the domain types compile and the mock corpus
// loads through the frontend API layer. Real views are Phase D3 (app shell).
export default async function HealthPage() {
  const items: FeedItem[] = await listFeedItems({});

  return (
    <main className="mx-auto max-w-2xl p-8 font-sans">
      <h1 className="text-2xl font-semibold text-brand-700">OurSay web-app</h1>
      <p className="mt-2 text-slate-600">
        Phase D1 scaffold — data structures, mock data, and the frontend API
        layer are wired. UI views land in Phase D3.
      </p>
      <p className="mt-4 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-800">
        Mock feed loaded: <strong>{items.length}</strong> records.
      </p>
    </main>
  );
}
