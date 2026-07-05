import { DistrictView } from "@/views/DistrictView";

export default async function DistrictPage({
  params,
}: {
  params: Promise<{ slug: string; dslug: string }>;
}) {
  const { dslug } = await params;
  return <DistrictView slug={dslug} />;
}
