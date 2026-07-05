import { ProfileView } from "@/views/ProfileView";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return <ProfileView handle={handle} />;
}
