import { PersonaView } from "@/views/PersonaView";

export default async function PersonaPage({
  params,
}: {
  params: Promise<{ thread: string; name: string }>;
}) {
  const { thread, name } = await params;
  return (
    <PersonaView
      threadId={decodeURIComponent(thread)}
      personaName={decodeURIComponent(name)}
    />
  );
}
