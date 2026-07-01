import { notFound } from "next/navigation";
import type { RecordKind } from "@/lib/types";
import { PostView } from "@/views/PostView";

const KINDS: RecordKind[] = ["statement", "petition", "poll", "result"];

export default async function PostPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  if (!KINDS.includes(kind as RecordKind)) notFound();
  return <PostView kind={kind as RecordKind} />;
}
