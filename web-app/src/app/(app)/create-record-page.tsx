import { notFound } from "next/navigation";
import { DETAIL_BY_ID } from "@/lib/mock";
import type { RecordKind } from "@/lib/types";
import { PostView } from "@/views/PostView";

/** Shared page factory — one route segment per record kind. */
export function createRecordPage(kind: RecordKind) {
  return async function RecordPage({
    params,
  }: {
    params: Promise<{ id: string }>;
  }) {
    const { id } = await params;
    const entry = DETAIL_BY_ID[id];
    if (!entry || entry.post.kind !== kind) notFound();
    return <PostView id={id} kind={kind} />;
  };
}
