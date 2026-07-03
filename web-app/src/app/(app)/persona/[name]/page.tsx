import { PersonaView } from "@/views/PersonaView";

export default async function PersonaPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  return <PersonaView personaName={decodeURIComponent(name)} />;
}

