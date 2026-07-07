import { DistrictView } from "@/views/DistrictView";

export default async function DistrictPage({
  params,
}: {
  params: Promise<{ slug: string; dslug: string }>;
}) {
  const { slug, dslug } = await params;
  return <DistrictView jurisdictionSlug={slug} slug={dslug} />;
}
