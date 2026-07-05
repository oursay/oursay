import { JurisdictionView } from "@/views/JurisdictionView";

export default async function JurisdictionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <JurisdictionView slug={slug} />;
}
