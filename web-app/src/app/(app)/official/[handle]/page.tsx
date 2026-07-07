import { OfficialView } from "@/views/OfficialView";

export default async function OfficialPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return <OfficialView handle={decodeURIComponent(handle)} />;
}
