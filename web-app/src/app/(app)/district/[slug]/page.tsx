import { DistrictView } from "@/views/DistrictView";

export default async function DistrictPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <DistrictView slug={slug} />;
}
